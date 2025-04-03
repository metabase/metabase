/* eslint-disable react/prop-types */
import { Component } from "react";

import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import ParameterTargetWidget from "../components/ParameterTargetWidget";
import { useTranslateContent2 } from "metabase/i18n/components/ContentTranslationContext";

export const QuestionParameterTargetWidget = ({ question, ...props }) => {
  const tc = useTranslateContent2();
  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card(), tc)
    : [];
  console.log("@m9216654", "mappingOptions", mappingOptions);

  return (
    <ParameterTargetWidget
      {...props}
      question={question}
      mappingOptions={mappingOptions}
    />
  );
};

export default QuestionLoaderHOC(QuestionParameterTargetWidget);
