/* eslint-disable react/prop-types */
import { Component } from "react";

import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import ParameterTargetWidget from "../components/ParameterTargetWidget";

class QuestionParameterTargetWidget extends Component {
  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? getParameterMappingOptions(question, null, question.card())
      : [];
    return (
      <ParameterTargetWidget
        {...props}
        question={question}
        mappingOptions={mappingOptions}
      />
    );
  }
}

export default QuestionLoaderHOC(QuestionParameterTargetWidget);
