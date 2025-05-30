import * as Yup from "yup";
import type { RequiredStringSchema } from "yup/lib/string";
import type { AnyObject } from "yup/lib/types";

const dataPartTypes = ["state", "navigate_to"] as const;
type DataPartType = (typeof dataPartTypes)[number];

export const dataPartSchema = Yup.object({
  type: Yup.string()
    .oneOf([...dataPartTypes])
    .required() as RequiredStringSchema<DataPartType, AnyObject>,
  value: Yup.mixed(),
});

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
      "content-filter",
      "tool-calls",
      "error",
      "other",
      "unknown",
    ])
    .required(),
  usage: Yup.object({
    promptTokens: Yup.number().required(),
    completionTokens: Yup.number().required(),
  }),
});
