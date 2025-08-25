import {
  any,
  function as functionSchema,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { CreateQuestionProps } from "./CreateQuestion";

const rawPropsSchema = strictObject({
  className: optional(any()),
  componentPlugins: optional(
    strictObject({
      mapQuestionClickActions: optional(any()),
      dashboard: optional(any()),
    }),
  ),
  deserializedCard: optional(any()),
  entityTypes: optional(any()),
  height: optional(any()),
  initialSqlParameters: optional(any()),
  isSaveEnabled: optional(any()),
  onBeforeSave: optional(any()),
  onNavigateBack: optional(any()),
  onRun: optional(any()),
  onSave: optional(any()),
  options: optional(any()),
  plugins: optional(
    strictObject({
      mapQuestionClickActions: optional(any()),
      dashboard: optional(any()),
    }),
  ),
  style: optional(any()),
  targetCollection: optional(any()),
  targetDashboardId: optional(any()),
  title: optional(any()),
  width: optional(any()),
  withChartTypeSelector: optional(any()),
  withDownloads: optional(any()),
  withResetButton: optional(any()),
});
const propsSchema: ValidateInferredSchema<
  CreateQuestionProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const createQuestionSchema = functionSchema({
  input: [propsSchema],
});
