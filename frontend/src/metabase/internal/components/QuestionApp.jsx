/* @flow */

import React from "react";
import { Route } from "react-router";

import _ from "underscore";

import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";

import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";
import { reactToScratchUrl } from "../lib/scratch";

type Props = {
  location: {
    hash: ?string,
    query: { [key: string]: string },
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
    console.log("location.hash", location.hash);
    return (
      <QuestionAndResultLoader
        questionHash={location.hash}
        questionId={params.questionId ? parseInt(params.questionId) : null}
      >
        {({ rawSeries }) => {
          if (rawSeries) {
            const scratchUrl = reactToScratchUrl(
              <Visualization
                rawSeries={rawSeries.map(({ card, data }) => ({
                  card: _.pick(card, "display", "visualization_settings"),
                  data: _.pick(data, "cols", "rows", "insights"),
                }))}
                className="spread"
              />,
            );
            if (location.query.scratch) {
              window.location = scratchUrl;
            }
            return (
              <div className="flex-full relative">
                <Visualization className="spread" rawSeries={rawSeries} />
                <Link className="absolute top right" to={scratchUrl}>
                  <Icon
                    name="pencil"
                    className="m2 text-brand-hover cursor-pointer"
                  />
                </Link>
              </div>
            );
          }
          return null;
        }}
      </QuestionAndResultLoader>
    );
  }
}

QuestionApp.routes = [
  <Route path="question" component={QuestionApp} />,
  <Route path="question/:questionId" component={QuestionApp} />,
];
