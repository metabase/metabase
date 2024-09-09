import type Question from "metabase-lib/v1/Question";

import { MetricHeader } from "./MetricHeader";

type MetricEditorProps = {
  question: Question;
};

export function MetricEditor({ question }: MetricEditorProps) {
  return <MetricHeader question={question} />;
}
