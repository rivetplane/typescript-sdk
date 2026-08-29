import { RivetplaneApiError, RivetplaneProtocolError } from "./errors.js";
import { apiErrorMessage, HttpTransport, type TransportOptions } from "./transport.js";
import type { ConsumerDevice, DeviceAuthorization, DeviceAuthorizationInput, DeviceTokenPollResult } from "./types.js";

export type DevicePairingOptions = Omit<TransportOptions, "authentication">;
export interface DevicePairingRequestOptions { signal?: AbortSignal; headers?: HeadersInit }

const pollErrors = new Set(["authorization_pending", "slow_down", "access_denied", "expired_token"]);
const objectBody = (body: unknown): Record<string, unknown> | undefined =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : undefined;

const pollError = (body: unknown): DeviceTokenPollResult | undefined => {
  const value = objectBody(body);
  const error = value?.error;
  if (typeof error !== "string" || !pollErrors.has(error)) return undefined;
  const interval = typeof value?.interval === "number" ? value.interval : undefined;
  if (error === "authorization_pending") return { status: "pending", interval };
  if (error === "slow_down") return { status: "slow_down", interval };
  if (error === "access_denied") return { status: "denied" };
  return { status: "expired" };
};

/** Public, unauthenticated device-code calls for an input-constrained consumer device. */
export class DevicePairing {
  readonly baseUrl: URL;
  private readonly transport: HttpTransport;

  constructor(options: DevicePairingOptions = {}) {
    this.transport = new HttpTransport(options);
    this.baseUrl = this.transport.baseUrl;
  }

  async create(input: DeviceAuthorizationInput, options: DevicePairingRequestOptions = {}): Promise<DeviceAuthorization> {
    const name = input.device_name.trim();
    if (!name || name.length > 80) throw new RangeError("device_name must contain 1 to 80 characters");
    const result = await this.transport.request<DeviceAuthorization>("POST", "v1/device/authorizations", {
      ...options,
      authenticated: false,
      body: { ...input, device_name: name },
    });
    if (!result.device_code || !result.user_code || !result.verification_uri || !Number.isFinite(result.expires_in) || !Number.isFinite(result.interval)) {
      throw new RivetplaneProtocolError("Rivetplane API returned an invalid device authorization response");
    }
    return result;
  }

  async poll(deviceCode: string, options: DevicePairingRequestOptions = {}): Promise<DeviceTokenPollResult> {
    if (!deviceCode) throw new RangeError("device_code is required");
    const result = await this.transport.response("POST", "v1/device/token", {
      ...options,
      authenticated: false,
      body: { device_code: deviceCode },
    });
    if (result.ok) {
      const body = objectBody(result.body);
      if (typeof body?.access_token !== "string" || body.token_type !== "Bearer" || typeof body.device_id !== "string" || !Array.isArray(body.scopes)) {
        throw new RivetplaneProtocolError("Rivetplane API returned an invalid device token response");
      }
      return { status: "approved", ...(result.body as Omit<Extract<DeviceTokenPollResult, { status: "approved" }>, "status">) };
    }
    const state = pollError(result.body);
    if (state) return state;
    throw new RivetplaneApiError(apiErrorMessage(result.body, result.status), {
      status: result.status,
      method: result.method,
      url: result.url.toString(),
      body: result.body,
      requestId: result.headers.get("x-request-id") ?? undefined,
    });
  }
}

/** Authenticated account calls that manage paired consumer controllers. */
export class ConsumerDevicesResource {
  constructor(private readonly transport: HttpTransport) {}
  list(options: DevicePairingRequestOptions = {}): Promise<ConsumerDevice[]> {
    return this.transport.request("GET", "v1/controller-devices", options);
  }
  revoke(deviceId: string, options: DevicePairingRequestOptions = {}): Promise<{ revoked: true }> {
    return this.transport.request("POST", `v1/controller-devices/${encodeURIComponent(deviceId)}/revoke`, options);
  }
}
