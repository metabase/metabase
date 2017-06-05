import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import { getMetricsByDatabaseId } from 'metabase/selectors/metadata'
import { fetchMetrics } from 'metabase/redux/metadata'

import { datamodel } from 'metabase/lib/urls'

import withBreadcrumbs from './WithBreadcrumbs'

class DatabaseMetrics extends Component {
    componentDidMount() {
        this.props.fetchMetrics()
    }
    render () {
        return <div className="py2"><MetricsList metrics={this.props.metrics} /></div>
    }
}

const MetricsList = ({ metrics = [] }) =>
    metrics.length > 0
    ?
        <ol className="Grid Grid--gutters Grid--1of3">
            { metrics.map(metric =>
                <li className="Grid-cell" key={metric.id}>
                    <div className="bordered rounded bg-white p4 shadowed">
                        <h2>{metric.name}</h2>
                        <span>{metric.database}</span>
                    </div>
                </li>
            )}
        </ol>
    : <div className="full-height flex flex-center">
        <h3 className="text-italic">No metrics exist for this database yet</h3>
      </div>

const mapStateToProps = (state, { params }) => ({
    metrics: getMetricsByDatabaseId(state, params.databaseId)
})

let NewMetric = ({ params }) =>
    <Link to={`/admin/dm/database/${params.databaseId}/metric/create`}>
        New metric
    </Link>

NewMetric = withRouter(NewMetric)

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchMetrics })(DatabaseMetrics),
    true,
    NewMetric
)
