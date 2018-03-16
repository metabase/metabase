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
    {question => (
      <QuestionResultLoader question={question}>
        {props => children({ question, ...props })}
      </QuestionResultLoader>
    )}
  </QuestionLoader>
);

export default QuestionAndResultLoader;
