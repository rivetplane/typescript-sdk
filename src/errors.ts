export interface ApiErrorOptions {
  status: number;
  method: string;
  url: string;
  body?: unknown;
  requestId?: string;
}

export class RivetplaneError extends Error {
  override readonly name: string = "RivetplaneError";
}

export class RivetplaneApiError extends RivetplaneError {
  override readonly name = "RivetplaneApiError";
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly requestId?: string;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.status = options.status;
    this.method = options.method;
    this.url = options.url;
    this.body = options.body;
    this.requestId = options.requestId;
  }

  get retryable(): boolean { return this.status === 408 || this.status === 429 || this.status >= 500; }
}

export class RivetplaneNetworkError extends RivetplaneError {
  override readonly name = "RivetplaneNetworkError";
  constructor(message: string, options?: ErrorOptions) { super(message, options); }
}

export class RivetplaneProtocolError extends RivetplaneError {
  override readonly name = "RivetplaneProtocolError";
}
