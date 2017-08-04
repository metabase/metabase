/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router'

import { getDatabasesList } from 'metabase/selectors/metadata'

import withBreadcrumbs from './WithBreadcrumbs'

import Card from '../components/Card'

class DatamodelDatabaseApp extends Component {
    render () {
        return <DatabaseList databases={this.props.databases} />
    }
}

const DatabaseList = ({ databases }) =>
    <ol className="Grid Grid--gutters Grid--1of3">
        {databases.map(database =>
            <li
                className="Grid-cell"
                key={database.id}
            >
                <Link to={`/admin/dm/database/${database.id}`}>
                    <Card>
                        <div className="p3">
                            <h2>{database.name}</h2>
                            <span>{database.engine}</span>
                        </div>
                    </Card>
                </Link>
            </li>
        )}
    </ol>

const mapStateToProps = state => ({
   databases: getDatabasesList(state)
})

export default withBreadcrumbs(
    connect(mapStateToProps)(DatamodelDatabaseApp)
)

