import * as Yup from "yup";

import type {
  CardDisplayType,
  DatasetQuery,
  JsMetricDefinition,
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
  "generated_entity",
  "adhoc_viz",
  "static_viz",
  "metric_viz",
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

export type MetricVizValue = {
  // A validated metric definition, ready to POST to /api/metric/dataset. `expression` is kept opaque
  // (`unknown[]`) rather than the full `JsExpressionRef` tuple union: this value is only forwarded to
  // the dataset endpoint, and embedding that union in the ts-pattern-matched `KnownDataPart` union
  // pushes TS's type-instantiation budget over the edge (surfacing as a spurious TS2589 elsewhere).
  definition: Omit<JsMetricDefinition, "expression"> & {
    expression: unknown[];
  };
  display?: CardDisplayType;
  title: string;
  breakout?: { field_id: number; temporal_unit?: string };
};

export type GeneratedQuery = {
  id: string;
  query: DatasetQuery;
};

export type GeneratedCard = {
  type: "card";
  id: string;
  title: string;
  query: GeneratedQuery;
  display?: CardDisplayType;
};

export type GeneratedEntity = GeneratedCard;

export type KnownDataPart =
  | { type: "navigate_to"; version: 1; value: string }
  | { type: "state"; version: 1; value: Record<string, any> }
  | { type: "todo_list"; version: 1; value: MetabotTodoItem[] }
  | { type: "transform_suggestion"; version: 1; value: SuggestedTransform }
  | { type: "code_edit"; version: 1; value: MetabotCodeEdit }
  | { type: "generated_entity"; version: 1; value: GeneratedEntity }
  | { type: "adhoc_viz"; version: 1; value: AdhocVizValue }
  | { type: "static_viz"; version: 1; value: StaticVizValue }
  | { type: "metric_viz"; version: 1; value: MetricVizValue };

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
