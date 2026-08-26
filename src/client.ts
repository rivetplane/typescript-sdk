import type { Authentication } from "./auth.js";
import { resolveToken } from "./auth.js";
import { RivetplaneApiError, RivetplaneNetworkError, RivetplaneProtocolError } from "./errors.js";
import { parseEventStream } from "./sse.js";
import type { CommandAccepted, CreateSessionInput, HarnessCapabilities, Machine, PendingInteraction, PendingListItem, PendingResponseInput, RetireMachineResult, Session, SessionListFilter, TranscriptEvent, TranscriptPage, TranscriptPageOptions } from "./types.js";
import { connectEventStream, type EventSocketOptions } from "./websocket.js";

export interface RivetplaneOptions {
  baseUrl?: string | URL;
  authentication: Authentication;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export interface RequestOptions { signal?: AbortSignal; headers?: HeadersInit }
export interface PendingListOptions extends RequestOptions { includeNonActionable?: boolean }

const encode = encodeURIComponent;
const messageFor = (body: unknown, status: number): string => typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : `Rivetplane API request failed with status ${status}`;

export class Rivetplane {
  readonly baseUrl: URL;
  readonly sessions: SessionsResource;
  readonly machines: MachinesResource;
  readonly harnesses: HarnessesResource;
  private readonly authentication: Authentication;
  private readonly fetcher: typeof fetch;
  private readonly headers: Headers;

  constructor(options: RivetplaneOptions) {
    this.baseUrl = new URL(options.baseUrl ?? "https://rivetplane.com");
    if (!this.baseUrl.pathname.endsWith("/")) this.baseUrl.pathname += "/";
    this.authentication = options.authentication;
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new TypeError("fetch is not available. Pass options.fetch in this runtime.");
    this.headers = new Headers(options.headers);
    this.sessions = new SessionsResource(this);
    this.machines = new MachinesResource(this);
    this.harnesses = new HarnessesResource(this);
  }

  url(path: string, query?: Record<string, string | number | undefined>): URL {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    return url;
  }

  async request<T>(method: string, path: string, options: RequestOptions & { body?: unknown; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
    const url = this.url(path, options.query); const headers = new Headers(this.headers);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    headers.set("authorization", `Bearer ${await resolveToken(this.authentication)}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    let response: Response;
    try { response = await this.fetcher(url, { method, headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), signal: options.signal }); }
    catch (error) { throw new RivetplaneNetworkError(`Rivetplane API request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    const text = await response.text(); let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; }
    catch { if (response.ok) throw new RivetplaneProtocolError(`Rivetplane API returned invalid JSON for ${method} ${url.pathname}`); body = text; }
    if (!response.ok) throw new RivetplaneApiError(messageFor(body, response.status), { status: response.status, method, url: url.toString(), body, requestId: response.headers.get("x-request-id") ?? undefined });
    return body as T;
  }

  async *sse<T>(path: string, options: RequestOptions = {}): AsyncGenerator<T> {
    const url = this.url(path); const headers = new Headers(this.headers); new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    headers.set("authorization", `Bearer ${await resolveToken(this.authentication)}`); headers.set("accept", "text/event-stream");
    let response: Response;
    try { response = await this.fetcher(url, { headers, signal: options.signal }); }
    catch (error) { throw new RivetplaneNetworkError(`Rivetplane SSE request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    if (!response.ok) { const text = await response.text(); let body: unknown = text; try { body = text ? JSON.parse(text) : undefined; } catch {} throw new RivetplaneApiError(messageFor(body, response.status), { status: response.status, method: "GET", url: url.toString(), body }); }
    for await (const event of parseEventStream<T>(response)) yield event.data;
  }

  events(options?: EventSocketOptions): AsyncGenerator<import("./types.js").ControlPlaneEvent> {
    const url = this.url("v1/events/stream"); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return connectEventStream(url, this.authentication, options);
  }

  listSessions(filter: SessionListFilter = {}, options: RequestOptions = {}): Promise<Session[]> {
    return this.sessions.list(filter, options);
  }

  getSession(sessionId: string, options: RequestOptions = {}): Promise<Session> {
    return this.sessions.get(sessionId, options);
  }

  listPending(options: PendingListOptions = {}): Promise<PendingListItem[]> {
    const { includeNonActionable, ...requestOptions } = options;
    return this.request("GET", "v1/pending", {
      ...requestOptions,
      query: { include_non_actionable: includeNonActionable ? "true" : undefined },
    });
  }
}

export class SessionsResource {
  constructor(private readonly client: Rivetplane) {}
  list(filter: SessionListFilter = {}, options: RequestOptions = {}): Promise<Session[]> {
    if (filter.limit !== undefined && (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 1_000)) throw new RangeError("limit must be an integer from 1 to 1000");
    return this.client.request("GET", "v1/sessions", { ...options, query: { machine: filter.machine, harness: filter.harness, status: filter.status, cwd: filter.cwd, before: filter.before, limit: filter.limit } });
  }
  get(sessionId: string, options: RequestOptions = {}): Promise<Session> { return this.client.request("GET", `v1/sessions/${encode(sessionId)}`, options); }
  transcript(sessionId: string, options: TranscriptPageOptions = {}): Promise<TranscriptPage> { return this.client.request("GET", `v1/sessions/${encode(sessionId)}/transcript`, { signal: options.signal, query: { since: options.since, limit: options.limit, cursor: options.cursor } }); }
  async *transcriptPages(sessionId: string, options: TranscriptPageOptions = {}): AsyncGenerator<TranscriptPage> { let cursor = options.cursor; do { const page = await this.transcript(sessionId, { ...options, cursor }); yield page; cursor = page.next_cursor ?? undefined; } while (cursor); }
  async *transcriptEvents(sessionId: string, options: TranscriptPageOptions = {}): AsyncGenerator<TranscriptEvent> { for await (const page of this.transcriptPages(sessionId, options)) yield* page.events; }
  streamTranscript(sessionId: string, options: RequestOptions = {}): AsyncGenerator<TranscriptEvent> { return this.client.sse(`v1/sessions/${encode(sessionId)}/transcript/stream`, options); }
  async pending(sessionId: string, options: RequestOptions = {}): Promise<PendingInteraction | null> { return (await this.client.request<{ pending: PendingInteraction | null }>("GET", `v1/sessions/${encode(sessionId)}/pending`, options)).pending; }
  sendMessage(sessionId: string, text: string, options: RequestOptions = {}): Promise<CommandAccepted> { return this.client.request("POST", `v1/sessions/${encode(sessionId)}/messages`, { ...options, body: { text } }); }
  respondToPending(sessionId: string, input: PendingResponseInput, options: RequestOptions = {}): Promise<CommandAccepted> { return this.client.request("POST", `v1/sessions/${encode(sessionId)}/pending/respond`, { ...options, body: input }); }
  interrupt(sessionId: string, options: RequestOptions = {}): Promise<CommandAccepted> { return this.client.request("POST", `v1/sessions/${encode(sessionId)}/interrupt`, options); }
}

export class MachinesResource {
  constructor(private readonly client: Rivetplane) {}
  list(options: RequestOptions = {}): Promise<Machine[]> { return this.client.request("GET", "v1/machines", options); }
  retire(machineId: string, options: RequestOptions = {}): Promise<RetireMachineResult> { return this.client.request("POST", `v1/machines/${encode(machineId)}/retire`, options); }
}

export class HarnessesResource {
  constructor(private readonly client: Rivetplane) {}
  listCapabilities(machineId?: string, options: RequestOptions = {}): Promise<HarnessCapabilities[]> { return this.client.request("GET", "v1/harness-capabilities", { ...options, query: { machine: machineId } }); }
  getCapabilities(machineId: string, harness: string, options: RequestOptions = {}): Promise<HarnessCapabilities> { return this.client.request("GET", `v1/machines/${encode(machineId)}/harnesses/${encode(harness)}/capabilities`, options); }
  createSession(machineId: string, harness: string, input: CreateSessionInput, options: RequestOptions = {}): Promise<CommandAccepted> { return this.client.request("POST", `v1/machines/${encode(machineId)}/harnesses/${encode(harness)}/sessions`, { ...options, body: input }); }
}
