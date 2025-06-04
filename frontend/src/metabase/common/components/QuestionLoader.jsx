/* eslint-disable react/prop-types */

import AdHocQuestionLoader from "metabase/containers/AdHocQuestionLoader";
import SavedQuestionLoader from "metabase/containers/SavedQuestionLoader";
import renderPropToHOC from "metabase/hoc/RenderPropToHOC";
import { serializeCardForUrl } from "metabase/lib/card";

/*
 * QuestionLoader
 *
 * Load either a saved or ad-hoc question depending on which is needed. Use
 * this component if you need to moved between saved and ad-hoc questions
 * as part of the same experience in the same part of the app.
 *
 * @example
 * import QuestionLoader from 'metabase/containers/QuestionLoader
 *
 * const MyQuestionExplorer = ({ params, location }) =>
 *  <QuestionLoader questionId={params.questionId} questionHash={
 *  { ({ question, loading, error }) =>
 *      <div>
 *        { // display info about the loaded question }
 *        <h1>{ question.displayName() }</h1>
 *
 *        { // link to a new question created by adding a filter }
 *        <Link
 *          to={question.getUrl()}
 *        >
 *          View this ad-hoc exploration
 *        </Link>
 *      </div>
 *  }
 *  </QuestionLoader>
 *
 */

const QuestionLoader = ({
  questionObject,
  questionId,
  questionHash,
  children,
}) =>
  questionObject != null ? (
    <AdHocQuestionLoader questionHash={serializeCardForUrl(questionObject)}>
      {children}
    </AdHocQuestionLoader>
  ) : // if there's a questionHash it means we're in ad-hoc land
  questionHash != null && questionHash !== "" ? (
    <AdHocQuestionLoader questionHash={questionHash}>
      {children}
    </AdHocQuestionLoader>
  ) : // otherwise if there's a non-null questionId it means we're in saved land
  questionId != null ? (
    <SavedQuestionLoader questionId={questionId}>
      {children}
    </SavedQuestionLoader>
  ) : // finally, if neither is present, just don't do anything
  null;

export default QuestionLoader;

export const QuestionLoaderHOC = renderPropToHOC(QuestionLoader);
