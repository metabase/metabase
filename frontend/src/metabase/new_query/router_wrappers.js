import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import NewQueryOptions from "./containers/NewQueryOptions";
import SegmentSearch from "./containers/SegmentSearch";
import MetricSearch from "./containers/MetricSearch";

@connect(null, { onChangeLocation: push })
export class NewQuestionStart extends Component {
    getUrlForQuery = (query) => {
        return query.question().getUrl()
    }

    render() {
        return (
            <NewQueryOptions
                getUrlForQuery={this.getUrlForQuery}
                metricSearchUrl="/question/new/metric"
                segmentSearchUrl="/question/new/segment"
            />
        )
    }
}

@connect(null, { onChangeLocation: push })
export class NewQuestionMetricSearch extends Component {
    getUrlForQuery = (query) => {
        return query.question().getUrl()
    }

    render() {
        return (
            <MetricSearch
                getUrlForQuery={this.getUrlForQuery}
                backButtonUrl="/question/new"
            />
        )
    }
}

@connect(null, { onChangeLocation: push })
export class NewQuestionSegmentSearch extends Component {
    getUrlForQuery = (query) => {
        return query.question().getUrl()
    }

    render() {
        return (
            <SegmentSearch
                getUrlForQuery={this.getUrlForQuery}
                backButtonUrl="/question/new"
            />
        )
    }
}
