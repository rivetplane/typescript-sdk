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

  it("uses the production server and sends session pagination filters", async () => {
    let requested: URL | undefined;
    const client = new Rivetplane({ authentication: "token", fetch: async (input) => {
      requested = new URL(String(input));
      return json([]);
    }});
    await client.sessions.list({ before: "2026-08-26T10:15:00Z", limit: 20 });
    assert.equal(requested?.origin, "https://rivetplane.com");
    assert.equal(requested?.searchParams.get("before"), "2026-08-26T10:15:00Z");
    assert.equal(requested?.searchParams.get("limit"), "20");
    await assert.rejects(async () => client.sessions.list({ limit: 0 }), RangeError);
  });
});
