import * as Yup from "yup";

import type {
  MetabotCodeEdit,
  MetabotTodoItem,
  SuggestedTransform,
} from "metabase-types/api";

export const toolInputAvailableSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  input: Yup.mixed(),
});

export const toolOutputAvailableSchema = Yup.object({
  toolCallId: Yup.string().required(),
  output: Yup.mixed(),
});

export const toolOutputErrorSchema = Yup.object({
  toolCallId: Yup.string().required(),
  errorText: Yup.string().required(),
});

export const dataEventSchema = Yup.object({
  type: Yup.string()
    .required()
    .test("data-prefix", 'type must start with "data-"', (val) =>
      val ? val.startsWith("data-") : false,
    ),
  data: Yup.mixed().required(),
});

export const knownDataPartTypes = [
  "data-navigate-to",
  "data-state",
  "data-todo-list",
  "data-code-edit",
  "data-transform-suggestion",
];

export type KnownDataPart =
  | { type: "data-navigate-to"; data: string }
  | { type: "data-state"; data: Record<string, any> }
  | { type: "data-todo-list"; data: MetabotTodoItem[] }
  | { type: "data-transform-suggestion"; data: SuggestedTransform }
  | { type: "data-code-edit"; data: MetabotCodeEdit };
