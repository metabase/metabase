/* eslint-disable react/prop-types */
import React from "react";

import ParameterTargetWidget from "metabase/parameters/components/ParameterTargetWidget";
import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";

import * as Dashboard from "metabase/meta/Dashboard";

@QuestionLoaderHOC
export default class QuestionParameterTargetWidget extends React.Component {
  props;

  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? Dashboard.getParameterMappingOptions(
          question.metadata(),
          null,
          question.card(),
        )
      : [];
    return <ParameterTargetWidget {...props} mappingOptions={mappingOptions} />;
  }
}
