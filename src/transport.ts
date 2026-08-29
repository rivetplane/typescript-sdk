import type { Authentication } from "./auth.js";
import { resolveToken } from "./auth.js";
import { RivetplaneApiError, RivetplaneNetworkError, RivetplaneProtocolError } from "./errors.js";

export interface TransportOptions {
  baseUrl?: string | URL;
  authentication?: Authentication;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export interface TransportRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  authenticated?: boolean;
}

export interface TransportResponse {
  body: unknown;
  headers: Headers;
  method: string;
  ok: boolean;
  status: number;
  url: URL;
}

const messageFor = (body: unknown, status: number): string =>
  typeof body === "object" && body && "error" in body && typeof body.error === "string"
    ? body.error
    : `Rivetplane API request failed with status ${status}`;

export class HttpTransport {
  readonly baseUrl: URL;
  private readonly authentication?: Authentication;
  private readonly fetcher: typeof fetch;
  private readonly headers: Headers;

  constructor(options: TransportOptions) {
    this.baseUrl = new URL(options.baseUrl ?? "https://rivetplane.com");
    if (!this.baseUrl.pathname.endsWith("/")) this.baseUrl.pathname += "/";
    this.authentication = options.authentication;
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new TypeError("fetch is not available. Pass options.fetch in this runtime.");
    this.headers = new Headers(options.headers);
  }

  url(path: string, query?: Record<string, string | number | undefined>): URL {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async response(method: string, path: string, options: TransportRequestOptions = {}): Promise<TransportResponse> {
    const url = this.url(path, options.query);
    const headers = new Headers(this.headers);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    if (options.authenticated !== false) {
      if (this.authentication === undefined) throw new TypeError("Authentication is required for this Rivetplane API call.");
      headers.set("authorization", `Bearer ${await resolveToken(this.authentication)}`);
    }
    if (options.body !== undefined) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: options.signal,
      });
    } catch (error) {
      throw new RivetplaneNetworkError(`Rivetplane API request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      if (response.ok) throw new RivetplaneProtocolError(`Rivetplane API returned invalid JSON for ${method} ${url.pathname}`);
      body = text;
    }
    return { body, headers: response.headers, method, ok: response.ok, status: response.status, url };
  }

  async request<T>(method: string, path: string, options: TransportRequestOptions = {}): Promise<T> {
    const result = await this.response(method, path, options);
    if (!result.ok) {
      throw new RivetplaneApiError(messageFor(result.body, result.status), {
        status: result.status,
        method,
        url: result.url.toString(),
        body: result.body,
        requestId: result.headers.get("x-request-id") ?? undefined,
      });
    }
    return result.body as T;
  }
}

export const apiErrorMessage = messageFor;
