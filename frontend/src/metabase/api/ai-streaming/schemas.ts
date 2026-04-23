import * as Yup from "yup";

import type {
  MetabotCodeEdit,
  MetabotTodoItem,
  SuggestedTransform,
} from "metabase-types/api";

export const dataPartSchema = Yup.object({
  type: Yup.string().required(),
  version: Yup.number().required(),
  value: Yup.mixed(),
});

export const knownDataPartTypes = [
  "navigate_to",
  "state",
  "todo_list",
  "code_edit",
  "transform_suggestion",
  "adhoc_viz",
  "static_viz",
];

export type AdhocVizValue = {
  query: unknown;
  link: string;
  title?: string;
  display?: string;
};

export type StaticVizValue = {
  entity_id: number;
};

export type KnownDataPart =
  | { type: "navigate_to"; version: 1; value: string }
  | { type: "state"; version: 1; value: Record<string, any> }
  | { type: "todo_list"; version: 1; value: MetabotTodoItem[] }
  | { type: "transform_suggestion"; version: 1; value: SuggestedTransform }
  | { type: "code_edit"; version: 1; value: MetabotCodeEdit }
  | { type: "adhoc_viz"; version: 1; value: AdhocVizValue }
  | { type: "static_viz"; version: 1; value: StaticVizValue };

export const toolCallPartSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  args: Yup.string(),
});

export const toolResultPartSchema = Yup.object({
  toolCallId: Yup.string().required(),
  result: Yup.mixed(),
});

export const finishPartSchema = Yup.object({
  finishReason: Yup.string()
    .oneOf([
      "stop",
      "length",
      "content_filter",
      "tool_calls",
      "error",
      "other",
      "unknown",
    ])
    .required(),
});

export const startPartSchema = Yup.object({
  messageId: Yup.string().required(),
});
