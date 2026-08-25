import assert from "node:assert/strict";
import { it } from "node:test";
import { parseEventStream } from "./sse.js";

it("parses chunked, multiline SSE JSON", async () => {
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(": ready\n\nid: 4\nevent: transcript\ndata: {\"type\":\ndata: \"agent_message\"}\n\n")); controller.close(); } }));
  const values = [];
  for await (const event of parseEventStream<{ type: string }>(response)) values.push(event);
  assert.deepEqual(values, [{ id: "4", event: "transcript", data: { type: "agent_message" } }]);
});
