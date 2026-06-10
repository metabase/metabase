/**
 * Typed events for the AI SDK v5/v6 UI message stream (SSE wire protocol).
 *
 * Mirrors the backend's Malli union in `metabase.metabot.schema.v2`
 * (`::ui-message-chunk`), itself ported from the Vercel AI SDK's
 * `UIMessageChunk` zod schemas:
 * https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts
 */

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MessageMetadata = {
  usage?: TokenUsage;
  usageByModel?: Record<string, TokenUsage>;
};

export type ProviderMetadata = Record<string, Record<string, unknown>>;

export type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

export type StartEvent = {
  type: "start";
  messageId?: string;
  messageMetadata?: unknown;
};

export type StartStepEvent = { type: "start-step" };

export type FinishStepEvent = { type: "finish-step" };

export type FinishEvent = {
  type: "finish";
  finishReason?: FinishReason;
  messageMetadata?: MessageMetadata;
};

export type AbortEvent = {
  type: "abort";
  reason?: string;
};

export type MessageMetadataEvent = {
  type: "message-metadata";
  messageMetadata: MessageMetadata;
};

export type TextStartEvent = {
  type: "text-start";
  id: string;
  providerMetadata?: ProviderMetadata;
};

export type TextDeltaEvent = {
  type: "text-delta";
  id: string;
  delta: string;
  providerMetadata?: ProviderMetadata;
};

export type TextEndEvent = {
  type: "text-end";
  id: string;
  providerMetadata?: ProviderMetadata;
};

export type ReasoningStartEvent = {
  type: "reasoning-start";
  id: string;
  providerMetadata?: ProviderMetadata;
};

export type ReasoningDeltaEvent = {
  type: "reasoning-delta";
  id: string;
  delta: string;
  providerMetadata?: ProviderMetadata;
};

export type ReasoningEndEvent = {
  type: "reasoning-end";
  id: string;
  providerMetadata?: ProviderMetadata;
};

export type ToolInputStartEvent = {
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
  providerExecuted?: boolean;
  dynamic?: boolean;
  title?: string;
};

export type ToolInputDeltaEvent = {
  type: "tool-input-delta";
  toolCallId: string;
  inputTextDelta: string;
};

export type ToolInputAvailableEvent = {
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic?: boolean;
  title?: string;
};

export type ToolInputErrorEvent = {
  type: "tool-input-error";
  toolCallId: string;
  toolName: string;
  input: unknown;
  errorText: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic?: boolean;
  title?: string;
};

export type ToolApprovalRequestEvent = {
  type: "tool-approval-request";
  approvalId: string;
  toolCallId: string;
};

export type ToolOutputAvailableEvent = {
  type: "tool-output-available";
  toolCallId: string;
  output: unknown;
  providerExecuted?: boolean;
  dynamic?: boolean;
  preliminary?: boolean;
};

export type ToolOutputErrorEvent = {
  type: "tool-output-error";
  toolCallId: string;
  errorText: string;
  providerExecuted?: boolean;
  dynamic?: boolean;
};

export type ToolOutputDeniedEvent = {
  type: "tool-output-denied";
  toolCallId: string;
};

export type SourceUrlEvent = {
  type: "source-url";
  sourceId: string;
  url: string;
  title?: string;
  providerMetadata?: ProviderMetadata;
};

export type SourceDocumentEvent = {
  type: "source-document";
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
  providerMetadata?: ProviderMetadata;
};

export type FileEvent = {
  type: "file";
  url: string;
  mediaType: string;
  providerMetadata?: ProviderMetadata;
};

export type ErrorEvent = {
  type: "error";
  errorText: string;
};

export type DataEvent = {
  type: `data-${string}`;
  id?: string;
  data: unknown;
  transient?: boolean;
};

export type SSEEvent =
  | StartEvent
  | StartStepEvent
  | FinishStepEvent
  | FinishEvent
  | AbortEvent
  | MessageMetadataEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputAvailableEvent
  | ToolInputErrorEvent
  | ToolApprovalRequestEvent
  | ToolOutputAvailableEvent
  | ToolOutputErrorEvent
  | ToolOutputDeniedEvent
  | SourceUrlEvent
  | SourceDocumentEvent
  | FileEvent
  | ErrorEvent
  | DataEvent;

export function isDataEvent(event: SSEEvent): event is DataEvent {
  return event.type.startsWith("data-");
}
