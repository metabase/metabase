/* eslint-disable react/prop-types */
import React from "react";

import ParameterTargetWidget from "metabase/parameters/components/ParameterTargetWidget";
import { QuestionLoaderHOC } from "metabase/containers/QuestionLoader";

import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import type { ParameterTarget } from "metabase-types/types/Parameter";

type Props = {
  questionObject?: any, // FIXME: minimal card
  questionId?: number,
  questionHash?: string,
  target: ?ParameterTarget,
  onChange: (target: ?ParameterTarget) => void,
};

@QuestionLoaderHOC
export default class QuestionParameterTargetWidget extends React.Component {
  props: Props;

  render() {
    const { question, ...props } = this.props;
    const mappingOptions = question
      ? getParameterMappingOptions(question.metadata(), null, question.card())
      : [];
    return <ParameterTargetWidget {...props} mappingOptions={mappingOptions} />;
  }
}
