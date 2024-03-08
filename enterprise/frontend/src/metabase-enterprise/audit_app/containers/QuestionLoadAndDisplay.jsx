import PropTypes from "prop-types";
import { useEffect, useRef, useImperativeHandle } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

const propTypes = {
  question: PropTypes.object,
  keepPreviousWhileLoading: PropTypes.bool,
  reload: PropTypes.bool,
  onLoad: PropTypes.func,
  reloadRef: PropTypes.shape({ current: PropTypes.func }),
};

const QuestionLoadAndDisplay = ({
  question,
  keepPreviousWhileLoading,
  reload,
  onLoad,
  reloadRef,
  ...props
}) => {
  const reloadFnRef = useRef(null);

  useImperativeHandle(reloadRef, () => () => reloadFnRef.current?.());

  useEffect(() => {
    reload && reloadFnRef.current?.();
  }, [reload]);

  return (
    <QuestionResultLoader
      question={question}
      keepPreviousWhileLoading={keepPreviousWhileLoading}
      onLoad={onLoad}
    >
      {({ loading, error, reload, ...resultProps }) => {
        const shouldShowLoader = loading && resultProps.results == null;
        reloadFnRef.current = reload;

        return (
          <LoadingAndErrorWrapper
            loading={shouldShowLoader}
            error={error || resultProps?.result?.error}
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
