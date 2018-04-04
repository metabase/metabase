/* @flow */

import React from "react";
import { Route } from "react-router";

import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

type Props = {
  location: {
    hash: ?string,
  },
  params: {
    questionId?: string,
  },
};

export default class QuestionApp extends React.Component {
  props: Props;

  static routes: ?[React$Element<Route>];

  render() {
    const { location, params } = this.props;
    if (!location.hash && !params.questionId) {
      return (
        <div className="p4 text-centered flex-full">
          Visit <strong>/_internal/question/:id</strong> or{" "}
          <strong>/_internal/question#:hash</strong>.
        </div>
      );
    }
    return (
      <QuestionAndResultLoader
        questionHash={location.hash}
        questionId={params.questionId ? parseInt(params.questionId) : null}
      >
        {({ rawSeries }) =>
          rawSeries && (
            <Visualization className="flex-full" rawSeries={rawSeries} />
          )
        }
      </QuestionAndResultLoader>
    );
  }
}

QuestionApp.routes = [
  <Route path="question" component={QuestionApp} />,
  <Route path="question/:questionId" component={QuestionApp} />,
];
