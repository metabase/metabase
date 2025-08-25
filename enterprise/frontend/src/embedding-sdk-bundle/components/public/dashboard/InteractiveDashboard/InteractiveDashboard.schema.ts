import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { InteractiveDashboardProps } from "./InteractiveDashboard";

const rawPropsSchema = strictObject({
  children: optional(any()),
  className: optional(any()),
  dashboardId: nonoptional(any()),
  dataPickerProps: optional(
    strictObject({
      entityTypes: optional(any()),
    }),
  ),
  drillThroughQuestionHeight: optional(any()),
  drillThroughQuestionProps: optional(
    strictObject({
      children: optional(any()),
      className: optional(any()),
      entityTypes: optional(any()),
      height: optional(any()),
      initialSqlParameters: optional(any()),
      isSaveEnabled: optional(any()),
      onBeforeSave: optional(any()),
      onRun: optional(any()),
      onSave: optional(any()),
      plugins: optional(any()),
      style: optional(any()),
      targetCollection: optional(any()),
      title: optional(any()),
      width: optional(any()),
      withChartTypeSelector: optional(any()),
      withDownloads: optional(any()),
      withResetButton: optional(any()),
    }),
  ),
  hiddenParameters: optional(any()),
  initialParameters: optional(any()),
  onLoad: optional(any()),
  onLoadWithoutCards: optional(any()),
  plugins: optional(
    strictObject({
      mapQuestionClickActions: optional(any()),
      dashboard: optional(any()),
    }),
  ),
  renderDrillThroughQuestion: optional(any()),
  style: optional(any()),
  withCardTitle: optional(any()),
  withDownloads: optional(any()),
  withTitle: optional(any()),
});
const propsSchema: ValidateInferredSchema<
  InteractiveDashboardProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const interactiveDashboardSchema = functionSchema({
  input: [propsSchema],
});
