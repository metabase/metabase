import {
  type QuestionLoaderChildrenProps,
  QuestionLoaderHOC,
} from "metabase/common/components/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type { CardId, ParameterTarget, UnsavedCard } from "metabase-types/api";

import { ParameterTargetWidget } from "../components/ParameterTargetWidget";

type OwnProps = {
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  placeholder?: string;
};

// Props the QuestionLoaderHOC forwards to its underlying QuestionLoader.
type LoaderProps = {
  questionObject?: UnsavedCard | null;
  questionId?: CardId | null;
  questionHash?: string | null;
  includeSensitiveFields?: boolean;
};

function QuestionParameterTargetWidgetBase({
  question,
  ...props
}: LoaderProps & OwnProps & QuestionLoaderChildrenProps) {
  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card(), null, null, {
        includeSensitiveFields: true,
      })
    : [];

  return (
    <ParameterTargetWidget
      target={props.target}
      onChange={props.onChange}
      placeholder={props.placeholder}
      question={question ?? undefined}
      mappingOptions={mappingOptions}
    />
  );
}

export const QuestionParameterTargetWidget = QuestionLoaderHOC(
  QuestionParameterTargetWidgetBase,
);
