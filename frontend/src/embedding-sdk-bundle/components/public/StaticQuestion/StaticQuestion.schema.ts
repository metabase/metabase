import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

// Typed against the internal shape so runtime validation accepts the internal
// string `query` prop used by the `useMetabot` hook.
const propsSchema: Yup.ObjectSchema<any> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  height: Yup.mixed().optional(),
  initialSqlParameters: Yup.mixed().optional(),
  sqlParameters: Yup.mixed().optional(),
  onSqlParametersChange: Yup.mixed().optional(),
  hiddenParameters: Yup.mixed().optional(),
  questionId: Yup.mixed().when(["token", "query", "card"], {
    is: (token: unknown, query: unknown, card: unknown) =>
      token !== undefined || query !== undefined || card !== undefined,
    then: (schema) => schema.optional(),
    otherwise: (schema) => schema.required(),
  }),
  token: Yup.mixed().optional(),
  card: Yup.mixed().optional(),
  query: Yup.string().optional(),
  style: Yup.mixed().optional(),
  title: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  withChartTypeSelector: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
  withAlerts: Yup.mixed().optional(),
}).noUnknown();

export const staticQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
