/* eslint-disable react/prop-types */
import { Component } from "react";

import { QuestionLoaderHOC } from "metabase/common/components/QuestionLoader";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import ParameterTargetWidget from "../components/ParameterTargetWidget";

class QuestionParameterTargetWidget extends Component {
  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? getParameterMappingOptions(
          question,
          null,
          question.card(),
          null,
          null,
          {
            includeSensitiveFields: true,
          },
        )
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLoaderHOC(QuestionParameterTargetWidget);
