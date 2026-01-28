import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { EditableDashboardProps } from "./EditableDashboard";

const propsSchema: Yup.SchemaOf<EditableDashboardProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  dashboardId: Yup.mixed().required(),
  token: Yup.mixed().optional(),
  dataPickerProps: Yup.object({
    entityTypes: Yup.mixed().optional(),
  })
    .optional()
    .noUnknown(),
  drillThroughQuestionHeight: Yup.mixed().optional(),
  drillThroughQuestionProps: Yup.object({
    children: Yup.mixed().optional(),
    className: Yup.mixed().optional(),
    entityTypes: Yup.mixed().optional(),
    height: Yup.mixed().optional(),
    initialSqlParameters: Yup.mixed().optional(),
    isSaveEnabled: Yup.mixed().optional(),
    onBeforeSave: Yup.mixed().optional(),
    onRun: Yup.mixed().optional(),
    onSave: Yup.mixed().optional(),
    plugins: Yup.mixed().optional(),
    style: Yup.mixed().optional(),
    targetCollection: Yup.mixed().optional(),
    title: Yup.mixed().optional(),
    width: Yup.mixed().optional(),
    withChartTypeSelector: Yup.mixed().optional(),
    withDownloads: Yup.mixed().optional(),
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
  renderDrillThroughQuestion: Yup.mixed().optional(),
  style: Yup.mixed().optional(),
  withCardTitle: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
  withSubscriptions: Yup.mixed().optional(),
  withTitle: Yup.mixed().optional(),
  onVisualizationChange: Yup.mixed().optional(),
  enableEntityNavigation: Yup.mixed().optional(),
}).noUnknown();

export const editableDashboardSchema: FunctionSchema = {
  input: [propsSchema],
};
