/* eslint-disable react/prop-types */
import React from "react";

import ParameterTargetWidget from "metabase/parameters/components/ParameterTargetWidget";
import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";

import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

class QuestionParameterTargetWidget extends React.Component {
  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? getParameterMappingOptions(question.metadata(), null, question.card())
      : [];
    return <ParameterTargetWidget {...props} mappingOptions={mappingOptions} />;
  }
}

export default QuestionLoaderHOC(QuestionParameterTargetWidget);
