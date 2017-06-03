import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getMetricsByDatabaseId } from 'metabase/selectors/metadata'
import { fetchMetrics } from 'metabase/redux/metadata'

import withBreadcrumbs from './WithBreadcrumbs'

class DatabaseMetrics extends Component {
    componentDidMount() {
        this.props.fetchMetrics()
    }
    render () {
        return <MetricsList metrics={this.props.metrics} />
    }
}

const MetricsList = ({ metrics }) =>
    <ol className="Grid Grid--gutters Grid--1of3">
        { metrics && metrics.map(metric =>
            <li className="Grid-cell">
                {metric.name}
            </li>
        )}
    </ol>

const mapStateToProps = (state, { params }) => ({
    metrics: getMetricsByDatabaseId(state, params.databaseId)
})

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchMetrics })(DatabaseMetrics))
