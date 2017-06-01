/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router'

import { getDatabaseById } from 'metabase/selectors/metadata'

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

    render () {
        const { database } = this.props
        return (
            <div className="wrapper">
                { database && (
                    <div>
                        <h2>{ database && database.name }</h2>
                        <ol>
                            <li><Link to={metricUrl(database.id)}>Metrics</Link></li>
                            <li><Link to={dataUrl(database.id)}>Data</Link></li>
                        </ol>
                    </div>
                )}
            </div>
        )
    }
}

export default connect(
    (state, { params }) => ({
        database: getDatabaseById(state, params.databaseId)
    })
)(DatabaseLanding)
