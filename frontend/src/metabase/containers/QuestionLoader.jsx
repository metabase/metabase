/* @flow */

import React from "react";

import AdHocQuestionLoader from "metabase/containers/AdHocQuestionLoader";
import SavedQuestionLoader from "metabase/containers/SavedQuestionLoader";

import Question from "metabase-lib/lib/Question";

export type ChildProps = {
  loading: boolean,
  error: ?any,
  question: ?Question,
};

type Props = {
  questionId?: ?number,
  questionHash?: ?string,
  children?: (props: ChildProps) => React$Element<any>,
};

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
 *          to={
 *            question.query()
 *                    .addFilter([
 *                      "SEGMENT",
 *                      question.query().filterSegmentOptions()[0]
 *                    ])
 *                    .question()
 *                    .getUrl()
 *          }
 *        >
 *          View this ad-hoc exploration
 *        </Link>
 *      </div>
 *  }
 *  </QuestionLoader>
 *
 */

const QuestionLoader = ({ questionId, questionHash, children }: Props) =>
  // if there's a questionHash it means we're in ad-hoc land
  questionHash ? (
    <AdHocQuestionLoader questionHash={questionHash} children={children} />
  ) : // otherwise if there's a non-null questionId it means we're in saved land
  questionId != null ? (
    <SavedQuestionLoader questionId={questionId} children={children} />
  ) : // finally, if neither is present, just don't do anything
  null;

export default QuestionLoader;
