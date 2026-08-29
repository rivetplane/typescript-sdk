import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DevicePairing, Rivetplane } from "./index.js";
import { RivetplaneApiError, RivetplaneProtocolError } from "./errors.js";

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

describe("consumer device pairing", () => {
  it("creates a device authorization without a bearer token", async () => {
    let request: { url: URL; headers: Headers; body: unknown } | undefined;
    const pairing = new DevicePairing({ baseUrl: "https://example.test/root", fetch: async (input, init) => {
      request = { url: new URL(String(input)), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return json({
        device_code: "private-device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.test/device",
        verification_uri_complete: "https://example.test/device?user_code=ABCD-EFGH",
        expires_in: 600,
        interval: 5,
      });
    }});
    const result = await pairing.create({ device_name: "  Kitchen display  ", device_id: "12345678-1234-4123-8123-123456789abc" });
    assert.equal(result.user_code, "ABCD-EFGH");
    assert.equal(request?.url.pathname, "/root/v1/auth/device/code");
    assert.equal(request?.headers.get("authorization"), null);
    assert.deepEqual(request?.body, { device_name: "Kitchen display", device_id: "12345678-1234-4123-8123-123456789abc" });
  });

  it("returns typed pending, slow-down, denial, expiry, and approval states", async () => {
    const responses = [
      json({ error: "authorization_pending", interval: 5 }, 400),
      json({ error: "slow_down", interval: 10 }, 429),
      json({ error: "access_denied" }, 400),
      json({ error: "expired_token" }, 400),
      json({ access_token: "consumer-secret", token_type: "Bearer", expires_in: null, scope: "sessions:list sessions:read transcripts:read messages:send", device: { id: "record-1", device_id: "device-1", name: "Kitchen display", scopes: ["sessions:list", "sessions:read", "transcripts:read", "messages:send"], created_at: "2026-08-29T00:00:00Z", last_used_at: null, revoked_at: null } }),
    ];
    const pairing = new DevicePairing({ fetch: async () => responses.shift()! });
    assert.deepEqual(await pairing.poll("code"), { status: "pending", interval: 5 });
    assert.deepEqual(await pairing.poll("code"), { status: "slow_down", interval: 10 });
    assert.deepEqual(await pairing.poll("code"), { status: "denied" });
    assert.deepEqual(await pairing.poll("code"), { status: "expired" });
    assert.deepEqual(await pairing.poll("code"), {
      status: "approved",
      access_token: "consumer-secret",
      token_type: "Bearer",
      expires_in: null,
      scope: "sessions:list sessions:read transcripts:read messages:send",
      device: { id: "record-1", device_id: "device-1", name: "Kitchen display", scopes: ["sessions:list", "sessions:read", "transcripts:read", "messages:send"], created_at: "2026-08-29T00:00:00Z", last_used_at: null, revoked_at: null },
    });
  });

  it("rejects unknown poll errors and malformed successful responses", async () => {
    const unknown = new DevicePairing({ fetch: async () => json({ error: "invalid_request" }, 400) });
    await assert.rejects(unknown.poll("code"), (error: unknown) => error instanceof RivetplaneApiError && error.status === 400);
    const malformed = new DevicePairing({ fetch: async () => json({ token_type: "Bearer" }) });
    await assert.rejects(malformed.poll("code"), RivetplaneProtocolError);
  });

  it("lists and revokes consumer devices with account authentication", async () => {
    const calls: Array<{ url: URL; headers: Headers }> = [];
    const client = new Rivetplane({ baseUrl: "https://example.test", authentication: "account-token", fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
      return calls.length === 1
        ? json([{ id: "display/1", device_id: "device-1", name: "Kitchen display", scopes: ["sessions:list"], created_at: "2026-08-29T00:00:00Z", last_used_at: null, revoked_at: null }])
        : json({ revoked: true });
    }});
    const devices = await client.consumerDevices.list();
    assert.equal(devices[0]?.name, "Kitchen display");
    assert.deepEqual(await client.consumerDevices.revoke("display/1"), { revoked: true });
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer account-token");
    assert.equal(calls[1]?.url.pathname, "/v1/consumer-devices/display%2F1/revoke");
  });
});
