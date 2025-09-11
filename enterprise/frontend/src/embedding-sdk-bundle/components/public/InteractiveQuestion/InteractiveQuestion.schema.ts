import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
  type infer as zInfer,
} from "zod/mini";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { InteractiveQuestionProps } from "./InteractiveQuestion";

const rawPropsSchema = strictObject({
  children: optional(any()),
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
  questionId: nonoptional(any()),
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
  InteractiveQuestionProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const interactiveQuestionSchema = functionSchema({
  input: [propsSchema],
});
