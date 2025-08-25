import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticQuestionProps } from "./StaticQuestion";

const rawPropsSchema = strictObject({
  children: optional(any()),
  className: optional(any()),
  height: optional(any()),
  initialSqlParameters: optional(any()),
  questionId: nonoptional(any()),
  style: optional(any()),
  title: optional(any()),
  width: optional(any()),
  withChartTypeSelector: optional(any()),
  withDownloads: optional(any()),
});
const propsSchema: ValidateInferredSchema<
  StaticQuestionProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const staticQuestionSchema = functionSchema({
  input: [propsSchema],
});
