export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MessageMetadata = {
  usage?: TokenUsage;
  usageByModel?: Record<string, TokenUsage>;
};

// lifecycle events
export type StartEvent = { type: "start"; messageId: string };
export type StartStepEvent = { type: "start-step" };
export type FinishStepEvent = { type: "finish-step" };
export type FinishEvent = {
  type: "finish";
  messageMetadata?: MessageMetadata;
};

// usage events
export type MessageMetadataEvent = {
  type: "message-metadata";
  messageMetadata: MessageMetadata;
};

// text events
export type TextStartEvent = { type: "text-start"; id: string };
export type TextDeltaEvent = { type: "text-delta"; id: string; delta: string };
export type TextEndEvent = { type: "text-end"; id: string };

// tool events
export type ToolInputStartEvent = {
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
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
};
export type ToolOutputAvailableEvent = {
  type: "tool-output-available";
  toolCallId: string;
  toolName: string;
  output: unknown;
  error?: unknown;
};

// error event
export type ErrorEvent = { type: "error"; errorText: string };

// data events use "data-{subtype}" naming convention
export type DataEvent = {
  type: `data-${string}`;
  id?: string;
  data: unknown;
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
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputAvailableEvent
  | ToolOutputAvailableEvent
  | ErrorEvent
  | DataEvent;

export function isDataEvent(event: SSEEvent): event is DataEvent {
  return event.type.startsWith("data-");
}
