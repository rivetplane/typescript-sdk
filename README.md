# @rivetplane/sdk

The first-party TypeScript SDK for the Rivetplane control-plane API. It uses standard `fetch`, streams SSE without `EventSource`, and uses the standard `WebSocket` API. The same package works in Node.js 24 or later, Bun, and modern browsers.

## Install

```sh
npm install @rivetplane/sdk
```

## Use the REST API

```ts
import { Rivetplane } from "@rivetplane/sdk";

const rivetplane = new Rivetplane({
  authentication: process.env.RIVETPLANE_TOKEN!,
});

for (const session of await rivetplane.listSessions({ status: "waiting_approval" })) {
  console.log(session.title, session.model?.provider_id, session.model?.model_id);
  const pending = await rivetplane.sessions.pending(session.id);
  if (pending?.type === "approval") {
    await rivetplane.sessions.respondToPending(session.id, {
      pending_id: pending.id,
      response: "approve",
      scope: "once",
    });
  }
}
```

Authentication can be a token, a function, or an object with `getToken()`. Use a provider when tokens can rotate:

```ts
const rivetplane = new Rivetplane({
  baseUrl: "http://127.0.0.1:8080",
  authentication: async () => tokenStore.current(),
});
```

The default server is `https://rivetplane.com`. Set `baseUrl` only for a self-hosted server or the local runner API.

Session lists support stable time-based pagination:

```ts
const sessions = await rivetplane.listSessions({ before: new Date().toISOString(), limit: 100 });
```

Session list and detail responses can include harness-reported identity fields. All are optional so clients remain compatible with adapters that do not report them.

```ts
const session = await rivetplane.getSession(sessionId);

console.log(session.title);
console.log(session.model?.provider_id, session.model?.model_id);
console.log(session.agent, session.read_only, session.metadata);
```

Use `listPending()` for the fleet-wide approval and question inbox. Pending items include the same optional session identity fields. By default, the server returns actionable items only.

```ts
const inbox = await rivetplane.listPending();
const diagnostics = await rivetplane.listPending({ includeNonActionable: true });

for (const item of inbox) {
  console.log(item.pending.id, item.title, item.model, item.agent, item.read_only);
}
```

## Pagination and streaming

`transcriptPages()` gets all transcript pages lazily. `transcriptEvents()` flattens those pages. `streamTranscript()` reads live SSE events with an authenticated `fetch` call. Thus, it works in browsers where `EventSource` cannot set an authorization header.

```ts
for await (const event of rivetplane.sessions.transcriptEvents(sessionId, { limit: 100 })) {
  console.log(event.type, event.payload);
}

const controller = new AbortController();
for await (const event of rivetplane.sessions.streamTranscript(sessionId, { signal: controller.signal })) {
  console.log(event);
}
```

The account-wide WebSocket reconnects with exponential backoff by default. Browser authentication uses Rivetplane's `bearer.<base64url-token>` subprotocol.

```ts
for await (const event of rivetplane.events({
  reconnect: { initialDelayMs: 500, maxDelayMs: 10_000 },
})) {
  console.log(event.type, event.session_id);
}
```

Node.js 24, Bun, and modern browsers provide the required WebSocket implementation. You can also pass a WHATWG-compatible WebSocket constructor in `options.webSocket`.

## Errors

Non-success HTTP responses throw `RivetplaneApiError`. It contains `status`, `method`, `url`, `body`, `requestId`, and `retryable`. Transport failures throw `RivetplaneNetworkError`. Invalid JSON or event data throws `RivetplaneProtocolError`.

See [`examples/basic.ts`](examples/basic.ts), [`examples/streaming.ts`](examples/streaming.ts), and [`docs/release.md`](docs/release.md).
