/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import {
    getDatabaseById,
    getMetricsByDatabaseId,
} from 'metabase/selectors/metadata'

import { fetchMetrics } from 'metabase/redux/metadata'

import Database from "metabase-lib/lib/metadata/Database";

import { datamodel } from 'metabase/lib/urls'

import withBreadcrumbs from './WithBreadcrumbs'

import Icon from 'metabase/components/Icon'

type Props = {
    database: Database,
    fetchMetrics: () => void
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
                { database && (
                <ol className="Grid Grid--gutters Grid--1of3">
                    <li className="Grid-cell">
                        <Link to={datamodel.metricList(database.id)}>
                            <div className="p4 bordered rounded shadowed bg-white">
                                <h2>Metrics</h2>
                                <MetricCount />
                            </div>
                        </Link>
                    </li>
                    <li className="Grid-cell">
                        <Link to={datamodel.dbData(database.id)}>
                            <div className="p4 bordered rounded shadowed bg-white">
                                <h2>Data</h2>
                                <TableCount count={database.tables.length} />
                            </div>
                        </Link>
                    </li>
                </ol>
                )}
            </div>
        )
    }
}

let  MetricCount = ({ count }) => <h4>{ count }</h4>

MetricCount = withRouter(connect((state, { params }) => ({
    count: getMetricsByDatabaseId(state, params.databaseId).length
}))(MetricCount))

const TableCount = ({ count }) => <h4>{ count } tables</h4>

const mapStateToProps = (state, { params }) => ({
    database: getDatabaseById(state, params.databaseId)
})

const SettingsLink = ({ database }) =>
    <Link to={`/admin/databases/${database.id}`}>
        <Icon name="gear" />
    </Link>

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchMetrics })(DatabaseLanding),
    true,
    connect(mapStateToProps)(SettingsLink)
)
