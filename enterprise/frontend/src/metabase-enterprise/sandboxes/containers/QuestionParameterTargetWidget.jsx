/* eslint-disable react/prop-types */
import { Component } from "react";

import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";
import ParameterTargetWidget from "metabase/parameters/components/ParameterTargetWidget";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

class QuestionParameterTargetWidget extends Component {
  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? getParameterMappingOptions(question, null, question.card())
      : [];
    console.log("props", this.props);
    console.log({ mappingOptions });
    return <ParameterTargetWidget {...props} mappingOptions={mappingOptions} />;
  }
}

export default QuestionLoaderHOC(QuestionParameterTargetWidget);
