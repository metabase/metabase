import * as Yup from "yup";

export const dataPartSchema = Yup.object({
  type: Yup.string().required(),
  version: Yup.number().required(),
  value: Yup.mixed(),
});

export const knownDataPartTypes = ["state", "navigate_to"];

export type KnownDataPart =
  | { type: "state"; version: 1; value: Record<string, any> }
  | { type: "navigate_to"; version: 1; value: string };
// TODO: add transforms stuffs

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
