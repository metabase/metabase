/* eslint-disable react/prop-types */
import React from "react";

import QuestionLoader from "metabase/containers/QuestionLoader";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";

/*
 * QuestionAndResultLoader
 *
 * Load a question and also run the query to get the result. Useful when you want
 * to load both a question and its visualization at the same time.
 *
 * @example
 *
 * import QuestionAndResultLoader from 'metabase/containers/QuestionAndResultLoader'
 *
 * const MyNewFeature = ({ params, location }) =>
 * <QuestionAndResultLoader question={question}>
 * { ({ question, result, cancel, reload }) =>
 *   <div>
 *   </div>
 * </QuestionAndResultLoader>
 *
 */
const QuestionAndResultLoader = ({ questionId, questionHash, children }) => (
  <QuestionLoader questionId={questionId} questionHash={questionHash}>
    {({ loading: questionLoading, error: questionError, ...questionProps }) => (
      <QuestionResultLoader question={questionProps.question}>
        {({ loading: resultLoading, error: resultError, ...resultProps }) =>
          children &&
          children({
            ...questionProps,
            ...resultProps,
            loading: resultLoading || questionLoading,
            error: resultError || questionError,
          })
        }
      </QuestionResultLoader>
    )}
  </QuestionLoader>
);

export default QuestionAndResultLoader;
