import { QuestionLoaderHOC } from "metabase/common/components/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type Question from "metabase-lib/v1/Question";
import type { ParameterTarget } from "metabase-types/api";

import { ParameterTargetWidget } from "../components/ParameterTargetWidget";

type QuestionParameterTargetWidgetProps = {
  question: Question | null;
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  placeholder?: string;
};

function QuestionParameterTargetWidget({
  question,
  ...props
}: QuestionParameterTargetWidgetProps) {
  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card(), null, null, {
        includeSensitiveFields: true,
      })
    : [];

  return (
    <ParameterTargetWidget
      {...props}
      question={question ?? undefined}
      mappingOptions={mappingOptions}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLoaderHOC(QuestionParameterTargetWidget);
