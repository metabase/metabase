import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticDashboardProps } from "./StaticDashboard";

const propsSchema: Yup.SchemaOf<StaticDashboardProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  dashboardId: Yup.mixed().when("token", {
    is: (token: unknown) => token !== undefined,
    then: (schema) => schema.optional(),
    otherwise: (schema) => schema.required(),
  }),
  token: Yup.mixed().optional(),
  dataPickerProps: Yup.object({
    entityTypes: Yup.mixed().optional(),
  })
    .optional()
    .noUnknown(),
  hiddenParameters: Yup.mixed().optional(),
  initialParameters: Yup.mixed().optional(),
  onLoad: Yup.mixed().optional(),
  onLoadWithoutCards: Yup.mixed().optional(),
  plugins: Yup.object({
    mapQuestionClickActions: Yup.mixed().optional(),
    dashboard: Yup.mixed().optional(),
  })
    .optional()
    .noUnknown(),
  style: Yup.mixed().optional(),
  withCardTitle: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
  withSubscriptions: Yup.mixed().optional(),
  withTitle: Yup.mixed().optional(),
  onVisualizationChange: Yup.mixed().optional(),
}).noUnknown();

export const staticDashboardSchema: FunctionSchema = {
  input: [propsSchema],
};
