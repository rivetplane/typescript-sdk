import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rivetplane } from "./client.js";
import { RivetplaneApiError } from "./errors.js";

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("Rivetplane REST client", () => {
  it("encodes session IDs, authentication, filters, and pending IDs", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new Rivetplane({ baseUrl: "https://example.test/root/", authentication: async () => "secret", fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/pending")) return json({ pending: { type: "approval", id: "pending-1", session_id: "machine/harness/local", tool_name: "shell", tool_input_summary: "run", requested_at: "2026-01-01T00:00:00Z" } });
      return json({ command_id: "command-1", accepted: true }, 202);
    }});
    const pending = await client.sessions.pending("machine/harness/local");
    await client.sessions.respondToPending("machine/harness/local", { pending_id: pending!.id, response: "approve", scope: "once" });
    assert.match(calls[0]!.url, /machine%2Fharness%2Flocal\/pending$/);
    assert.equal(new Headers(calls[0]!.init?.headers).get("authorization"), "Bearer secret");
    assert.deepEqual(JSON.parse(String(calls[1]!.init?.body)), { pending_id: "pending-1", response: "approve", scope: "once" });
  });

  it("iterates transcript pages", async () => {
    const cursors: Array<string | null> = [];
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "token", fetch: async (input) => {
      const cursor = new URL(String(input)).searchParams.get("cursor"); cursors.push(cursor);
      return json({ events: [{ id: cursor ? "e2" : "e1", session_id: "s", seq: cursor ? 2 : 1, ts: "now", type: "agent_message", payload: { text: "hello" } }], next_cursor: cursor ? null : "next" });
    }});
    const ids: string[] = [];
    for await (const event of client.sessions.transcriptEvents("s", { limit: 1 })) ids.push(event.id);
    assert.deepEqual(ids, ["e1", "e2"]); assert.deepEqual(cursors, [null, "next"]);
  });

  it("throws structured API errors", async () => {
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "token", fetch: async () => json({ error: "stale pending_id" }, 409) });
    await assert.rejects(client.sessions.interrupt("s"), (error: unknown) => error instanceof RivetplaneApiError && error.status === 409 && error.body !== undefined && !error.retryable);
  });

  it("listSessions returns optional session identity fields", async () => {
    let requested: URL | undefined;
    const client = new Rivetplane({ authentication: "token", fetch: async (input) => {
      requested = new URL(String(input));
      return json([{ id: "runner/codex/session", machine_id: "runner", harness_type: "codex", cwd: "/repo", title: "Repair deployment", model: { provider_id: "openai", model_id: "gpt-5.4" }, agent: "default", read_only: false, metadata: { source: "app-server" }, status: "running", created_at: "2026-08-26T10:00:00Z", last_activity_at: "2026-08-26T10:15:00Z", pending: null }]);
    }});
    const [session] = await client.listSessions({ before: "2026-08-26T10:15:00Z", limit: 20 });
    assert.equal(requested?.origin, "https://rivetplane.com");
    assert.equal(requested?.searchParams.get("before"), "2026-08-26T10:15:00Z");
    assert.equal(requested?.searchParams.get("limit"), "20");
    assert.equal(session?.title, "Repair deployment");
    assert.deepEqual(session?.model, { provider_id: "openai", model_id: "gpt-5.4" });
    assert.equal(session?.agent, "default");
    assert.equal(session?.read_only, false);
    assert.deepEqual(session?.metadata, { source: "app-server" });
    await assert.rejects(async () => client.listSessions({ limit: 0 }), RangeError);
  });

  it("getSession returns optional session identity fields", async () => {
    let requested: URL | undefined;
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "token", fetch: async (input) => {
      requested = new URL(String(input));
      return json({ id: "runner/claude/session", machine_id: "runner", harness_type: "claude-code", cwd: "/repo", title: "Review API", model: { provider_id: "anthropic", model_id: "claude-sonnet-4-6" }, agent: "review", read_only: true, metadata: { transcript_source: "jsonl" }, status: "waiting_input", created_at: "2026-08-26T10:00:00Z", last_activity_at: "2026-08-26T10:15:00Z", pending: null });
    }});
    const session = await client.getSession("runner/claude/session");
    assert.match(requested!.pathname, /runner%2Fclaude%2Fsession$/);
    assert.equal(session.title, "Review API");
    assert.deepEqual(session.model, { provider_id: "anthropic", model_id: "claude-sonnet-4-6" });
    assert.equal(session.agent, "review");
    assert.equal(session.read_only, true);
    assert.deepEqual(session.metadata, { transcript_source: "jsonl" });
  });

  it("listPending returns session identity and supports diagnostic items", async () => {
    let requested: URL | undefined;
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "token", fetch: async (input) => {
      requested = new URL(String(input));
      return json([{ pending: { type: "approval", id: "pending-1", session_id: "runner/codex/session", tool_name: "shell", tool_input_summary: "npm test", requested_at: "2026-08-26T10:15:00Z" }, session_id: "runner/codex/session", machine_id: "runner", harness_type: "codex", cwd: "/repo", title: "Repair deployment", model: { provider_id: "openai", model_id: "gpt-5.4" }, agent: "default", read_only: false, metadata: { source: "app-server" }, actionable: true }]);
    }});
    const [item] = await client.listPending({ includeNonActionable: true });
    assert.equal(requested?.pathname, "/v1/pending");
    assert.equal(requested?.searchParams.get("include_non_actionable"), "true");
    assert.equal(item?.title, "Repair deployment");
    assert.deepEqual(item?.model, { provider_id: "openai", model_id: "gpt-5.4" });
    assert.equal(item?.agent, "default");
    assert.equal(item?.read_only, false);
    assert.deepEqual(item?.metadata, { source: "app-server" });
  });

  it("exposes account-wide attention responses without a custom request shim", async () => {
    const calls: Array<{ url: URL; body?: unknown }> = [];
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "token", fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return json({ command_id: "command-1", completed: true });
    }});
    const result = await client.attention.respond("pending/1", { response: "approve", scope: "once" });
    assert.deepEqual(result, { command_id: "command-1", completed: true });
    assert.equal(calls[0]?.url.pathname, "/v1/pending/pending%2F1/respond");
    assert.deepEqual(calls[0]?.body, { response: "approve", scope: "once" });
  });
});
