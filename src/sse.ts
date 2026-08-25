import { RivetplaneNetworkError, RivetplaneProtocolError } from "./errors.js";

export interface ServerSentEvent<T> { data: T; event?: string; id?: string; retry?: number }

export async function* parseEventStream<T>(response: Response): AsyncGenerator<ServerSentEvent<T>> {
  if (!response.body) throw new RivetplaneNetworkError("The SSE response has no readable body");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += value ?? "";
      const normalized = buffer.replace(/\r\n/g, "\n");
      let boundary = normalized.indexOf("\n\n");
      if (boundary < 0) { buffer = normalized; if (done) break; continue; }
      let rest = normalized;
      while (boundary >= 0) {
        const block = rest.slice(0, boundary); rest = rest.slice(boundary + 2);
        const lines = block.split("\n");
        const data: string[] = []; let event: string | undefined; let id: string | undefined; let retry: number | undefined;
        for (const line of lines) {
          if (!line || line.startsWith(":")) continue;
          const colon = line.indexOf(":"); const field = colon < 0 ? line : line.slice(0, colon); const raw = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "data") data.push(raw); else if (field === "event") event = raw; else if (field === "id") id = raw; else if (field === "retry" && /^\d+$/.test(raw)) retry = Number(raw);
        }
        if (data.length) {
          try { yield { data: JSON.parse(data.join("\n")) as T, ...(event ? { event } : {}), ...(id ? { id } : {}), ...(retry !== undefined ? { retry } : {}) }; }
          catch (error) { throw new RivetplaneProtocolError(`SSE data is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
        }
        boundary = rest.indexOf("\n\n");
      }
      buffer = rest;
      if (done) break;
    }
  } finally { reader.releaseLock(); }
}
