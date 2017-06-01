import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getMetricsByDatabaseId } from 'metabase/selectors/metadata'
import { fetchMetrics } from 'metabase/redux/metadata'

class DatabaseMetrics extends Component {
    componentDidMount() {
        this.props.fetchMetrics()
    }
    render () {
        return <MetricsList metrics={this.props.metrics} />
    }
}

const MetricsList = ({ metrics }) =>
    <ol>
        { metrics && metrics.map(metric =>
            <li>{metric.name}</li>
        )}
    </ol>

const mapStateToProps = (state, { params }) => ({
    metrics: getMetricsByDatabaseId(state, params.databaseId)
})

export default connect(mapStateToProps,{ fetchMetrics })(DatabaseMetrics)
