import assert from "node:assert/strict";
import { it } from "node:test";
import { connectEventStream } from "./websocket.js";

class FakeSocket extends EventTarget {
  static connections = 0;
  static lastProtocols?: string | string[];
  readonly connection = ++FakeSocket.connections;
  constructor(readonly url: string | URL, readonly protocols?: string | string[]) {
    super();
    FakeSocket.lastProtocols = protocols;
    queueMicrotask(() => {
      this.dispatchEvent(new Event("open"));
      if (this.connection === 1) this.dispatchEvent(new Event("close"));
      else this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session_upsert", ts: "now", data: { id: "s1" } }) }));
    });
  }
  close(): void { this.dispatchEvent(new Event("close")); }
}

it("authenticates browser WebSockets and reconnects", async () => {
  FakeSocket.connections = 0;
  const controller = new AbortController();
  const stream = connectEventStream(new URL("wss://example.test/v1/events/stream"), "token", { signal: controller.signal, reconnect: { initialDelayMs: 1 }, webSocket: FakeSocket as unknown as typeof WebSocket });
  const first = await stream.next(); controller.abort();
  assert.equal(first.value?.type, "session_upsert"); assert.equal(FakeSocket.connections, 2);
  assert.match(String(FakeSocket.lastProtocols), /^bearer\./);
});
