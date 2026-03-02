import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { InteractiveQuestionProps } from "./InteractiveQuestion";

const propsSchema: Yup.SchemaOf<InteractiveQuestionProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  componentPlugins: Yup.object({
    mapQuestionClickActions: Yup.mixed().optional(),
    dashboard: Yup.mixed().optional(),
  })
    .optional()
    .noUnknown(),
  deserializedCard: Yup.mixed().optional(),
  entityTypes: Yup.mixed().optional(),
  dataPicker: Yup.mixed().optional(),
  height: Yup.mixed().optional(),
  initialSqlParameters: Yup.mixed().optional(),
  hiddenParameters: Yup.mixed().optional(),
  isSaveEnabled: Yup.mixed().optional(),
  onBeforeSave: Yup.mixed().optional(),
  onNavigateBack: Yup.mixed().optional(),
  onRun: Yup.mixed().optional(),
  onSave: Yup.mixed().optional(),
  options: Yup.mixed().optional(),
  plugins: Yup.object({
    mapQuestionClickActions: Yup.mixed().optional(),
    dashboard: Yup.mixed().optional(),
  })
    .optional()
    .noUnknown(),
  questionId: Yup.mixed().required(),
  token: Yup.mixed().optional(),
  style: Yup.mixed().optional(),
  targetCollection: Yup.mixed().optional(),
  targetDashboardId: Yup.mixed().optional(),
  title: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  withChartTypeSelector: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
  withAlerts: Yup.mixed().optional(),
  onVisualizationChange: Yup.mixed().optional(),
}).noUnknown();

export const interactiveQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
