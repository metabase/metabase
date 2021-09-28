import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Visualization from "metabase/visualizations/components/Visualization";

const propTypes = {
  question: PropTypes.object,
  keepPreviousWhileLoading: PropTypes.bool,
  reload: PropTypes.bool,
  onLoad: PropTypes.func,
};

const QuestionLoadAndDisplay = ({
  question,
  keepPreviousWhileLoading,
  reload,
  onLoad,
  ...props
}) => {
  const reloadRef = useRef();

  useEffect(() => {
    reload && reloadRef.current();
  }, [reload]);

  return (
    <QuestionResultLoader
      question={question}
      keepPreviousWhileLoading={keepPreviousWhileLoading}
      onLoad={onLoad}
    >
      {({ loading, error, reload, ...resultProps }) => {
        const shouldShowLoader = loading && resultProps.results == null;
        reloadRef.current = reload;

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
};

QuestionLoadAndDisplay.propTypes = propTypes;

export default QuestionLoadAndDisplay;
