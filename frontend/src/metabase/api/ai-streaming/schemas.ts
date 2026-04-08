import type {
  MetabotCodeEdit,
  MetabotTodoItem,
  SuggestedTransform,
} from "metabase-types/api";

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
