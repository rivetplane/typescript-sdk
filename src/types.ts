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

export interface Approval {
  type: "approval";
  id: string;
  session_id: string;
  tool_name: string;
  tool_input_summary: string;
  requested_at: Timestamp;
  resolved_at?: Timestamp;
  resolution?: ApprovalResolution;
}

export interface Question {
  type: "question";
  id: string;
  session_id: string;
  prompt: string;
  options?: string[];
  requested_at: Timestamp;
  resolved_at?: Timestamp;
  response?: string;
}

export type PendingInteraction = Approval | Question;

export interface Session {
  id: string;
  machine_id: string;
  harness_type: string;
  cwd: string;
  status: SessionStatus;
  created_at: Timestamp;
  last_activity_at: Timestamp;
  pending: PendingInteraction | null;
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
  directories: string[];
  models: HarnessModel[];
  default_model?: { provider_id: string; model_id: string };
  reported_at: Timestamp;
}

export interface SessionListFilter { machine?: string; harness?: string; status?: SessionStatus; cwd?: string }
export interface TranscriptPage { events: TranscriptEvent[]; next_cursor: string | null }
export interface TranscriptPageOptions { since?: Timestamp; limit?: number; cursor?: string; signal?: AbortSignal }
export interface CreateSessionInput { cwd: string; title?: string; model: { provider_id: string; model_id: string } }
export interface PendingResponseInput { pending_id: string; response: string; scope?: ApprovalScope }
export interface CommandAccepted { command_id: string; accepted: true }
export interface RetireMachineResult { retired: true }

export interface ControlPlaneEvent<TData = unknown> {
  type: string;
  ts: Timestamp;
  machine_id?: string;
  session_id?: string;
  data: TData;
}
