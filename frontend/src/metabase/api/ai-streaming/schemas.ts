import * as Yup from "yup";

import type {
  MetabotCodeEdit,
  MetabotTodoItem,
  SuggestedTransform,
} from "metabase-types/api";

// v6 tool call: received via tool-input-available event
export const toolCallPartSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  input: Yup.mixed(),
});

export type ToolCallPart = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

// v6 tool result: received via tool-output-available event
export const toolResultPartSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  output: Yup.mixed(),
});

export type ToolResultPart = {
  toolCallId: string;
  toolName: string;
  output: unknown;
};

// v6 data parts use "data-{subtype}" naming
export const knownDataPartTypes = [
  "data-navigate_to",
  "data-state",
  "data-todo_list",
  "data-code_edit",
  "data-transform_suggestion",
];

export type KnownDataPart =
  | { type: "data-navigate_to"; data: string }
  | { type: "data-state"; data: Record<string, any> }
  | { type: "data-todo_list"; data: MetabotTodoItem[] }
  | { type: "data-transform_suggestion"; data: SuggestedTransform }
  | { type: "data-code_edit"; data: MetabotCodeEdit };
