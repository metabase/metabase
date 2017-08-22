import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import NewQuery from "metabase/new_query/containers/NewQuery";

@connect(null, { onChangeLocation: push })
export class NewQuestionStart extends Component {
    newQuestionFromQuery = (query) => {
        this.props.onChangeLocation(query.question().getUrl())
    }

    reflectUpdatedStepInUrl = (step) => {
        if (step === "metricSearch") {
            this.props.onChangeLocation("/question/new/metric")
        } else if (step === "segmentSearch") {
            this.props.onChangeLocation("/question/new/segment")
        }
    }

    render() {
        return (
            <NewQuery
                onComplete={this.newQuestionFromQuery}
                onCurrentStepChanged={this.reflectUpdatedStepInUrl}
            />
        )
    }
}

@connect(null, { onChangeLocation: push })
export class NewQuestionMetricSearch extends Component {
    newQuestionFromQuery = (query) => {
        this.props.onChangeLocation(query.question().getUrl())
    }

    render() {
        return (
            <NewQuery
                onComplete={this.newQuestionFromQuery}
                defaultStep={"metricSearch"}
            />
        )
    }
}

@connect(null, { onChangeLocation: push })
export class NewQuestionSegmentSearch extends Component {
    newQuestionFromQuery = (query) => {
        this.props.onChangeLocation(query.question().getUrl())
    }

    render() {
        return (
            <NewQuery
                onComplete={this.newQuestionFromQuery}
                defaultStep={"segmentSearch"}
            />
        )
    }
}
