import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { StaticQuestionInternalProps } from "./StaticQuestion";

const hasEntityProp = (props: StaticQuestionInternalProps | null | undefined) =>
  props != null &&
  (props.questionId !== undefined ||
    props.token !== undefined ||
    props.card !== undefined ||
    props.query !== undefined);

// Typed against the internal shape so runtime validation accepts both the
// public object `query` prop and the internal string `query` prop used by the
// `useMetabot` hook.
const propsSchema: Yup.SchemaOf<StaticQuestionInternalProps> = Yup.object({
  children: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  height: Yup.mixed().optional(),
  initialSqlParameters: Yup.mixed().optional(),
  sqlParameters: Yup.mixed().optional(),
  onSqlParametersChange: Yup.mixed().optional(),
  hiddenParameters: Yup.mixed().optional(),
  questionId: Yup.mixed().optional(),
  token: Yup.mixed().optional(),
  card: Yup.mixed().optional(),
  query: Yup.mixed().optional(),
  style: Yup.mixed().optional(),
  title: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  withChartTypeSelector: Yup.mixed().optional(),
  withDownloads: Yup.mixed().optional(),
  withAlerts: Yup.mixed().optional(),
})
  .test(
    "has-entity-prop",
    "questionId, token, card, or query is required",
    hasEntityProp,
  )
  .noUnknown();

export const staticQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
