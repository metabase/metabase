import * as Yup from "yup";

import type { DatasetQuery } from "metabase-types/api";

export const dataPartSchema = Yup.object({
  type: Yup.string().required(),
  version: Yup.number().required(),
  value: Yup.mixed(),
});

export const knownDataPartTypes = ["state", "navigate_to", "transform_query"];

export type KnownDataPart =
  | { type: "state"; version: 1; value: Record<string, any> }
  | { type: "navigate_to"; version: 1; value: string }
  | { type: "transform_query"; version: 1; value: DatasetQuery };

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
