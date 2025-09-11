import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticDashboardProps } from "./StaticDashboard";

const rawPropsSchema = strictObject({
  children: optional(any()),
  className: optional(any()),
  dashboardId: nonoptional(any()),
  dataPickerProps: optional(
    strictObject({
      entityTypes: optional(any()),
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
  style: optional(any()),
  withCardTitle: optional(any()),
  withDownloads: optional(any()),
  withTitle: optional(any()),
});
const propsSchema: ValidateInferredSchema<
  StaticDashboardProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const staticDashboardSchema = functionSchema({
  input: [propsSchema],
});
