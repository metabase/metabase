/* eslint-disable react/prop-types */

import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import ParameterTargetWidget from "../components/ParameterTargetWidget";

export const QuestionParameterTargetWidget = ({ question, ...props }) => {
  const tc = useTranslateContent();
  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card(), tc)
    : [];

  return (
    <ParameterTargetWidget
      {...props}
      question={question}
      mappingOptions={mappingOptions}
    />
  );
};

export default QuestionLoaderHOC(QuestionParameterTargetWidget);
