import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticQuestionInternalProps } from "./StaticQuestion";

// Typed against the internal shape so runtime validation still accepts the
// `query` prop used by the `useMetabot` hook. The public API (see
// `StaticQuestionProps`) intentionally doesn't expose `query` to users.
const propsSchema: Yup.SchemaOf<StaticQuestionInternalProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  height: Yup.mixed().optional(),
  initialSqlParameters: Yup.mixed().optional(),
  hiddenParameters: Yup.mixed().optional(),
  questionId: Yup.mixed().when(["token", "query"], {
    is: (token: unknown, query: unknown) =>
      token !== undefined || query !== undefined,
    then: (schema) => schema.optional(),
    otherwise: (schema) => schema.required(),
  }),
  token: Yup.mixed().optional(),
  query: Yup.mixed().optional(),
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
