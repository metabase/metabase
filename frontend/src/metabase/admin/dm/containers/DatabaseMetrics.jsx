import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

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

const MetricsList = ({ metrics = [] }) =>
    <ol className="Grid Grid--gutters Grid--1of3">
        { metrics.map(metric =>
            <li className="Grid-cell">
                <div className="bordered rounded bg-white shadowed">
                    {metric.name}
                </div>
            </li>
        )}
    </ol>

const mapStateToProps = (state, { params }) => ({
    metrics: getMetricsByDatabaseId(state, params.databaseId)
})

let NewMetric = ({ params }) =>
    <Link to={`/admin/dm/database/${params.databaseId}/metrics/new`}>
        New metric
    </Link>

NewMetric = withRouter(NewMetric)

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchMetrics })(DatabaseMetrics),
    true,
    NewMetric
)
