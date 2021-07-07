/* eslint-disable react/prop-types */
import React from "react";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Visualization from "metabase/visualizations/components/Visualization";

const QuestionLoadAndDisplay = ({
  question,
  onLoad,
  keepPreviousWhileLoading,
  ...props
}) => (
  <QuestionResultLoader
    question={question}
    onLoad={onLoad}
    keepPreviousWhileLoading={keepPreviousWhileLoading}
  >
    {({ loading, error, ...resultProps }) => {
      const shouldShowLoader = loading && resultProps.results == null;
      return (
        <LoadingAndErrorWrapper
          loading={shouldShowLoader}
          error={error}
          noWrapper
        >
          <Visualization {...props} {...resultProps} />
        </LoadingAndErrorWrapper>
      );
    }}
  </QuestionResultLoader>
);

export default QuestionLoadAndDisplay;
