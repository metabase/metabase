import React, { Component } from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";

import { withBackground } from 'metabase/hoc/Background'

import NewQueryOptions from "./containers/NewQueryOptions";
import MetricSearch from "./containers/MetricSearch";
import { fetchMetric, fetchTableMetadata } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/lib/Question";

@withBackground('bg-slate-extra-light')
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

@withBackground('bg-slate-extra-light')
export class NewQuestionMetricSearch extends Component {
    render() {
        return (
            <MetricSearch
                getUrlForMetric={(metric) =>  `/question/new/metric/${metric.id}`}
                backButtonUrl="/question/new"
            />
        )
    }
}

@connect((state) => ({ metadata: getMetadata(state) }), { replace, fetchMetric, fetchTableMetadata })
@withBackground('bg-slate-extra-light')
export class NewQuestionFromMetric extends Component {
    componentWillMount = async () => {
        const metadataBeforeInit = this.props.metadata

        const metricId = this.props.params.metricId
        if (!metadataBeforeInit.metrics[metricId]) {
            await this.props.fetchMetric(metricId)
        }

        const tableId = this.props.metadata.metrics[metricId].table_id
        if (!metadataBeforeInit.tables[tableId] ||
            !metadataBeforeInit.tables[tableId].fields ||
            !metadataBeforeInit.tables[tableId].fields.length) {
            await this.props.fetchTableMetadata(tableId)
        }

        const metric = this.props.metadata.metrics[metricId]
        const query = this.getQueryForMetric(metric)
        const question = query.question().setDisplay(query.breakouts().length > 0 ? "line" : "scalar")

        setTimeout(() => this.props.replace(question.getUrl()), 0)
    }

    getQueryForMetric(metric) {
        const question = Question.create({ metadata: this.props.metadata })

        const queryWithoutFilter = question.query()
            .setDatabase(metric.table.db)
            .setTable(metric.table)
            .addAggregation(metric.aggregationClause())

        const dateField = metric.table.fields.find((field) => field.isDate())

        if (dateField) {
            const dateFilter = ["time-interval", dateField.dimension().mbql(), -365, "day"]
            return queryWithoutFilter
                .addFilter(dateFilter)
                .addBreakout(dateField.getDefaultBreakout())
        } else {
            return queryWithoutFilter
        }
    }

    render() {
        return <LoadingAndErrorWrapper loading={true}/>
    }
}
