import type { Authentication } from "./auth.js";
import { resolveToken } from "./auth.js";
import { RivetplaneProtocolError } from "./errors.js";
import type { ControlPlaneEvent } from "./types.js";

export interface ReconnectOptions { enabled?: boolean; initialDelayMs?: number; maxDelayMs?: number; multiplier?: number; maxAttempts?: number }
export interface EventSocketOptions { signal?: AbortSignal; reconnect?: ReconnectOptions; webSocket?: typeof WebSocket }

const encodeToken = (value: string): string => {
  const bytes = new TextEncoder().encode(value); let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const wait = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

export async function* connectEventStream(url: URL, authentication: Authentication, options: EventSocketOptions = {}): AsyncGenerator<ControlPlaneEvent> {
  const Socket = options.webSocket ?? globalThis.WebSocket;
  if (!Socket) throw new TypeError("WebSocket is not available. Pass options.webSocket in this runtime.");
  const ownController = new AbortController();
  const onAbort = (): void => ownController.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const reconnect = { enabled: true, initialDelayMs: 250, maxDelayMs: 10_000, multiplier: 2, maxAttempts: Number.POSITIVE_INFINITY, ...options.reconnect };
  let attempts = 0;
  try {
    while (!ownController.signal.aborted) {
      const token = await resolveToken(authentication);
      const socket = new Socket(url, [`bearer.${encodeToken(token)}`]);
      const queue: ControlPlaneEvent[] = []; let notify: (() => void) | undefined; let closed = false; let failure: unknown;
      socket.addEventListener("message", (message) => {
        try { attempts = 0; queue.push(JSON.parse(String(message.data)) as ControlPlaneEvent); notify?.(); }
        catch (error) { failure = new RivetplaneProtocolError(`WebSocket event is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); socket.close(1003, "Invalid JSON"); notify?.(); }
      });
      socket.addEventListener("error", () => { failure ??= new Error("WebSocket connection failed"); });
      socket.addEventListener("close", () => { closed = true; notify?.(); });
      const close = (): void => socket.close(1000, "Subscription closed");
      ownController.signal.addEventListener("abort", close, { once: true });
      while (!closed || queue.length) {
        if (queue.length) { yield queue.shift()!; continue; }
        await new Promise<void>((resolve) => { notify = resolve; }); notify = undefined;
        if (failure instanceof RivetplaneProtocolError) throw failure;
      }
      ownController.signal.removeEventListener("abort", close);
      if (!reconnect.enabled || ownController.signal.aborted || attempts >= reconnect.maxAttempts) {
        if (failure && !ownController.signal.aborted) throw failure;
        return;
      }
      const delay = Math.min(reconnect.initialDelayMs * reconnect.multiplier ** attempts, reconnect.maxDelayMs); attempts += 1;
      try { await wait(delay, ownController.signal); }
      catch { if (ownController.signal.aborted) return; throw new Error("WebSocket reconnect wait failed"); }
    }
  } finally { options.signal?.removeEventListener("abort", onAbort); ownController.abort(); }
}
