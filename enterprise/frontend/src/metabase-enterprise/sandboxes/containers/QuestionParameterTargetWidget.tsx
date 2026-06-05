import type { ComponentType } from "react";

import { QuestionLoaderHOC } from "metabase/common/components/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type Question from "metabase-lib/v1/Question";
import type { CardId, ParameterTarget, UnsavedCard } from "metabase-types/api";

import { ParameterTargetWidget } from "../components/ParameterTargetWidget";

type OwnProps = {
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  placeholder?: string;
};

type InnerProps = OwnProps & {
  question: Question | null;
};

// Props the QuestionLoaderHOC forwards to its underlying QuestionLoader.
type LoaderProps = {
  questionObject?: UnsavedCard | null;
  questionId?: CardId | null;
  questionHash?: string | null;
  includeSensitiveFields?: boolean;
};

function QuestionParameterTargetWidget({ question, ...props }: InnerProps) {
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

// QuestionLoaderHOC comes from an untyped JS HOC, so we narrow the exported
// component's props to what callers actually pass.
const QuestionParameterTargetWidgetContainer = QuestionLoaderHOC(
  QuestionParameterTargetWidget,
) as ComponentType<OwnProps & LoaderProps>;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionParameterTargetWidgetContainer;
