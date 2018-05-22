import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { withBackground } from "metabase/hoc/Background";

import NewQueryOptions from "./containers/NewQueryOptions";
import MetricSearch from "./containers/MetricSearch";

@connect(null, { onChangeLocation: push })
@withBackground("bg-slate-extra-light")
export class NewQuestionStart extends Component {
  getUrlForQuery = query => {
    return query.question().getUrl();
  };

  render() {
    return (
      <NewQueryOptions
        getUrlForQuery={this.getUrlForQuery}
        metricSearchUrl="/question/new/metric"
        segmentSearchUrl="/question/new/segment"
      />
    );
  }
}

@connect(null, { onChangeLocation: push })
@withBackground("bg-slate-extra-light")
export class NewQuestionMetricSearch extends Component {
  getUrlForQuery = query => {
    return query.question().getUrl();
  };

  render() {
    return (
      <MetricSearch
        getUrlForQuery={this.getUrlForQuery}
        backButtonUrl="/question/new"
      />
    );
  }
}
