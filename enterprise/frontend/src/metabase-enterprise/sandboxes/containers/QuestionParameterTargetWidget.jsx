/* eslint-disable react/prop-types */

import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";
import { useTranslateContent2 } from "metabase/i18n/components/ContentTranslationContext";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import ParameterTargetWidget from "../components/ParameterTargetWidget";

export const QuestionParameterTargetWidget = ({ question, ...props }) => {
  const tc = useTranslateContent2();
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
