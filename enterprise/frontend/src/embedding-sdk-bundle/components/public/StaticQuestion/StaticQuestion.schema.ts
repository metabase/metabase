import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticQuestionProps } from "./StaticQuestion";

const propsSchema: Yup.SchemaOf<StaticQuestionProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  height: Yup.mixed().optional(),
  initialSqlParameters: Yup.mixed().optional(),
  hiddenParameters: Yup.mixed().optional(),
  questionId: Yup.mixed().required(),
  style: Yup.mixed().optional(),
  title: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  withChartTypeSelector: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
}).noUnknown();

export const staticQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
