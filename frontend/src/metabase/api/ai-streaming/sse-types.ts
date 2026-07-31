// Typed view of the AI SDK v5/v6 SSE wire protocol (UIMessageChunk), mirroring
// the backend's `metabase.metabot.schema.v2/ui-message-chunk`. Outer chunk keys
// are camelCase (spec-faithful); `data-*` payloads keep Metabase snake_case.

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MessageMetadata = {
  usage?: TokenUsage;
  usageByModel?: Record<string, TokenUsage>;
  // a typed error's code, ridden on the trailing `finish` event so the client
  // can branch on it (e.g. the usage-limit upgrade prompt)
  errorCode?: string;
  // the turn's user message row external_id, ridden on the `start` event so
  // the client can retry the prompt later
  userMessageId?: string;
};

export type ProviderMetadata = Record<string, Record<string, unknown>>;

export type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

// lifecycle events
export type StartEvent = {
  type: "start";
  messageId?: string;
  messageMetadata?: MessageMetadata;
};
export type StartStepEvent = { type: "start-step" };
export type FinishStepEvent = { type: "finish-step" };
export type FinishEvent = {
  type: "finish";
  finishReason?: FinishReason;
  messageMetadata?: MessageMetadata;
};

// usage events
export type MessageMetadataEvent = {
  type: "message-metadata";
  messageMetadata: MessageMetadata;
};

// text events
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

// reasoning events
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

// tool events
export type ToolInputStartEvent = {
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
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
export type ToolOutputAvailableEvent = {
  type: "tool-output-available";
  toolCallId: string;
  output: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic?: boolean;
  preliminary?: boolean;
};
export type ToolOutputErrorEvent = {
  type: "tool-output-error";
  toolCallId: string;
  errorText: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic?: boolean;
};

// error event
export type ErrorEvent = { type: "error"; errorText: string };

// data events use "data-{subtype}" naming convention
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
  | ToolOutputAvailableEvent
  | ToolOutputErrorEvent
  | ErrorEvent
  | DataEvent;
