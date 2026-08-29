export type Timestamp = string;
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type MachineStatus = "online" | "offline";
export interface Machine {
  id: string;
  name: string;
  owner_account_id: string;
  last_seen_at: Timestamp;
  status: MachineStatus;
  harnesses?: string[];
}

export type SessionStatus = "running" | "waiting_input" | "waiting_approval" | "completed" | "error";
export type ApprovalResolution = "approve" | "deny" | "timeout" | "cancelled";
export type ApprovalScope = "once" | "always_this_tool" | "always_session";
export type PendingResponseMode = "remote" | "local";

export interface Approval {
  type: "approval";
  id: string;
  session_id: string;
  tool_name: string;
  tool_input_summary: string;
  command?: string;
  description?: string;
  source?: string;
  response_mode?: PendingResponseMode;
  read_only?: boolean;
  expires_at?: Timestamp;
  requested_at: Timestamp;
  resolved_at?: Timestamp;
  resolution?: ApprovalResolution;
}

export interface Question {
  type: "question";
  id: string;
  session_id: string;
  prompt: string;
  header?: string;
  options?: string[];
  option_details?: Array<{ label: string; description?: string }>;
  questions?: Array<{ prompt: string; header: string; options: Array<{ label: string; description?: string }>; multiple?: boolean; custom?: boolean }>;
  tool_call_id?: string;
  source?: string;
  response_mode?: PendingResponseMode;
  read_only?: boolean;
  expires_at?: Timestamp;
  requested_at: Timestamp;
  resolved_at?: Timestamp;
  response?: string;
}

export type PendingInteraction = Approval | Question;

export interface SessionModel {
  provider_id: string;
  model_id: string;
}

export interface SessionIdentity {
  title?: string;
  model?: SessionModel;
  agent?: string;
  read_only?: boolean;
  metadata?: JsonValue;
}

export interface Session extends SessionIdentity {
  id: string;
  machine_id: string;
  harness_type: string;
  cwd: string;
  status: SessionStatus;
  created_at: Timestamp;
  last_activity_at: Timestamp;
  pending: PendingInteraction | null;
}

export interface PendingListItem extends SessionIdentity {
  pending: PendingInteraction;
  session_id: string;
  machine_id: string;
  harness_type: string;
  cwd: string;
  actionable: boolean;
  reason?: string;
  reason_code?: string;
}

export interface UserMessagePayload { text: string }
export interface AgentMessagePayload { text: string }
export interface ToolCallPayload { tool_call_id: string; tool_name: string; input_summary: string; input?: JsonValue }
export interface ToolResultPayload { tool_call_id: string; output_summary: string; output?: JsonValue; is_error: boolean }
export interface PermissionRequestPayload { approval_id: string; tool_name: string; tool_input_summary: string }
export interface PermissionResponsePayload { approval_id: string; resolution: ApprovalResolution; scope?: ApprovalScope; actor_id?: string }
export interface StatusChangePayload { from: SessionStatus; to: SessionStatus; reason?: string }

export interface TranscriptEventPayloadMap {
  user_message: UserMessagePayload;
  agent_message: AgentMessagePayload;
  tool_call: ToolCallPayload;
  tool_result: ToolResultPayload;
  permission_request: PermissionRequestPayload;
  permission_response: PermissionResponsePayload;
  status_change: StatusChangePayload;
}

export type TranscriptEventType = keyof TranscriptEventPayloadMap;
export type TranscriptEventOf<TType extends TranscriptEventType> = {
  id: string;
  session_id: string;
  seq: number;
  ts: Timestamp;
  type: TType;
  payload: TranscriptEventPayloadMap[TType];
};
export type TranscriptEvent = { [TType in TranscriptEventType]: TranscriptEventOf<TType> }[TranscriptEventType];

export interface HarnessModel {
  provider_id: string;
  model_id: string;
  name: string;
  status?: "alpha" | "beta" | "deprecated" | "active";
  context_limit?: number;
  output_limit?: number;
}

export interface HarnessCapabilities {
  machine_id: string;
  harness_type: string;
  can_create_session: boolean;
  can_send_message?: boolean;
  can_interrupt?: boolean;
  can_respond_to_approval?: boolean;
  can_respond_to_question?: boolean;
  directories: string[];
  models: HarnessModel[];
  default_model?: { provider_id: string; model_id: string };
  reported_at: Timestamp;
}

export interface SessionListFilter { machine?: string; harness?: string; status?: SessionStatus; cwd?: string; before?: Timestamp; limit?: number }
export interface TranscriptPage { events: TranscriptEvent[]; next_cursor: string | null }
export interface TranscriptPageOptions { since?: Timestamp; limit?: number; cursor?: string; signal?: AbortSignal }
export interface CreateSessionInput { cwd: string; title?: string; model: { provider_id: string; model_id: string } }
export interface PendingResponseInput { pending_id: string; response: string; scope?: ApprovalScope }
export interface CommandAccepted { command_id: string; accepted: true }
export interface CommandCompleted { command_id: string; completed: true }
export interface RetireMachineResult { retired: true }

export interface ControlPlaneEvent<TData = unknown> {
  type: string;
  ts: Timestamp;
  machine_id?: string;
  session_id?: string;
  data: TData;
}

export type UsageCounterMode = "incremental" | "cumulative";
export type UsageCostStatus = "reported" | "estimated" | "unavailable";

/** Normalized token counts. A null field means that the harness did not report it. */
export interface UsageTokenCounts {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cache_read: number | null;
  cache_write: number | null;
  total: number | null;
}

/** Cost for one usage sample. Estimated cost is not an authoritative bill. */
export interface UsageCost {
  status: UsageCostStatus;
  amount?: number;
  currency?: string;
}

export interface UsageContext {
  window_size: number;
  used_tokens?: number | null;
}

export interface UsageQuotaWindow {
  name: string;
  used_percent?: number | null;
  remaining?: number | null;
  limit?: number | null;
  resets_at?: Timestamp;
}

/** A content-free usage event. event_id is stable and supports idempotent ingestion. */
export interface UsageSample {
  event_id: string;
  machine_id: string;
  /** Null or absent for account-level usage and quota events. */
  session_id?: string | null;
  turn_id?: string;
  timestamp: Timestamp;
  harness: string;
  source: string;
  provider?: string;
  model?: string;
  source_counter_mode: UsageCounterMode;
  tokens: UsageTokenCounts;
  context?: UsageContext;
  cost: UsageCost;
  quota?: UsageQuotaWindow[];
}

export interface UsageCurrencyAmount {
  currency: string;
  amount: number;
}

/** Aggregated cost. by_currency is present when one amount cannot represent all currencies. */
export interface UsageCostSummary extends UsageCost {
  coverage: "complete" | "partial" | "none";
  priced_samples: number;
  unavailable_samples: number;
  by_currency?: UsageCurrencyAmount[];
}

export interface UsageAggregate {
  tokens: UsageTokenCounts;
  cost: UsageCostSummary;
}

export interface UsageBreakdown extends UsageAggregate {
  key: string;
}

export interface UsageContextRecord {
  machine_id: string;
  session_id?: string | null;
  harness: string;
  provider?: string;
  model?: string;
  timestamp: Timestamp;
  window_size: number;
  used_tokens?: number | null;
}

export interface UsageQuotaRecord {
  machine_id: string;
  session_id?: string | null;
  harness: string;
  provider?: string;
  model?: string;
  timestamp: Timestamp;
  windows: UsageQuotaWindow[];
}

export interface UsageQuery {
  from?: Timestamp;
  to?: Timestamp;
  machine?: string;
  harness?: string;
  session?: string;
  provider?: string;
  model?: string;
}

/** SDK-friendly name for the GET /v1/usage query. */
export type UsageFilter = UsageQuery;

export interface UsageReport {
  range: { from: Timestamp; to: Timestamp };
  totals: UsageAggregate;
  breakdowns: {
    by_machine: UsageBreakdown[];
    by_harness: UsageBreakdown[];
    by_session: UsageBreakdown[];
    by_provider: UsageBreakdown[];
    by_model: UsageBreakdown[];
  };
  context: UsageContextRecord[];
  quota: UsageQuotaRecord[];
  samples_count: number;
}
