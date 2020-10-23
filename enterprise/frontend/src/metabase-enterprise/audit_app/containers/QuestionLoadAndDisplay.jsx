import React from "react";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Visualization from "metabase/visualizations/components/Visualization";

const QuestionLoadAndDisplay = ({ question, onLoad, ...props }) => (
  <QuestionResultLoader question={question} onLoad={onLoad}>
    {({ loading, error, ...resultProps }) => (
      <LoadingAndErrorWrapper loading={loading} error={error} noWrapper>
        {() => <Visualization {...props} {...resultProps} />}
      </LoadingAndErrorWrapper>
    )}
  </QuestionResultLoader>
);

export default QuestionLoadAndDisplay;
