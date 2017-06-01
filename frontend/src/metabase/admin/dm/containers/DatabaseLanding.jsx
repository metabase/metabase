/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import {
    getDatabaseById,
    getMetricsByDatabaseId,
    getTablesByDatabaseId
} from 'metabase/selectors/metadata'

import { fetchMetrics } from 'metabase/redux/metadata'

import Icon from 'metabase/components/Icon'

import Database from "metabase-lib/lib/metadata/Database";

type Props = {
    database: Database
}


function metricUrl(databaseId: number) {
    return `/admin/dm/database/${databaseId}/metrics`
}

function dataUrl(databaseId: number) {
    return `/admin/dm/database/${databaseId}/data`
}

class DatabaseLanding extends Component {

    props: Props

    componentDidMount () {
        this.props.fetchMetrics()
    }

    render () {
        const { database } = this.props
        return (
            <div>
                { database && [
                    <DatabaseHeader database={database} />,
                    <DatabaseNav database={database} />
                ]}
            </div>
        )
    }
}


let  MetricCount = ({ count }) => <h4>{ count }</h4>

MetricCount = withRouter(connect((state, { params }) => ({
    count: getMetricsByDatabaseId(state, props.params.databaseId).length
}))(MetricCount))

let TableCount = ({ count }) => <h4>{ count } tables</h4>

TableCount = withRouter(connect((state, { params }) => ({
     count: getTablesByDatabaseId(state, props.params.databaseId).length
}))(TableCount))

const DatabaseNav = ({ database }) =>
    <div className="wrapper">
        <ol className="Grid Grid--gutters Grid--1of3">
            <li className="Grid-cell">
                <Link to={metricUrl(database.id)}>
                    <div className="p4 bordered rounded shadowed bg-white">
                        <h2>Metrics</h2>
                        <MetricCount />
                    </div>
                </Link>
            </li>
            <li className="Grid-cell">
                <Link to={dataUrl(database.id)}>
                    <div className="p4 bordered rounded shadowed bg-white">
                        <h2>Data</h2>
                        <TableCount />
                    </div>
                </Link>
            </li>
        </ol>
    </div>

const DatabaseHeader = ({ database }) =>
    <div className="border-bottom py2">
        <div className="wrapper flex align-center">
            <h2>{database.name}</h2>
            <div className="ml-auto">
                <Icon name="search" />
                <Icon name="gear" />
            </div>
        </div>
    </div>

const mapStateToProps = (state, { params }) => ({
    database: getDatabaseById(state, params.databaseId)
})

export default connect(
    mapStateToProps,
    { fetchMetrics }
)(DatabaseLanding)
