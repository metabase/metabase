/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import { getTablesByDatabaseId } from 'metabase/selectors/metadata'
import { fetchSegments } from 'metabase/redux/metadata'

import DataModelTableLink from './DataModelTableLink'
import withBreadcrumbs from './WithBreadcrumbs'

import TableHoverCard from './TableHoverCard'

import { sortAlphabeticallyByKey } from 'metabase/lib/utils'

class DatabaseData extends Component {
    componentDidMount () {
        this.props.fetchSegments()
    }
    render () {
        const { tables } = this.props
        return tables.length > 10
            ? (
                <AlphabeticalTableList
                    tables={sortAlphabeticallyByKey(tables, 'name')}
                    path={this.props.router.path}
                />
            )
            : <TableList tables={tables} />
    }
}


const AlphabeticalTableList = ({ tables, path }) =>
    <div>
        <ol className="flex full my2 align-center">
            { tables && Object.keys(tables).map(key =>
                <li className="flex-full text-align-center" key={key}>
                    <Link to={{ pathname: path, hash: `#${key}` }}>
                        {key.toUpperCase()}
                    </Link>
                </li>
            )}
        </ol>
        <ol>
            { tables && Object.keys(tables).map((key) =>
                <li
                    id={key}
                    className="block full mb2"
                    key={key}
                >
                    <div className="border-bottom pb1 mb2">
                        <h2>{ key.toUpperCase() }</h2>
                    </div>
                    <TableList tables={tables[key]} showHoverCard={true} />
                </li>
            )}
        </ol>
    </div>



class TableListItem extends Component {
    state = {
        showPopover: false
    }
    render () {
        const { table, showHoverCard } = this.props
        const { showPopover } = this.state
        return (
            <div
                onMouseEnter={() => showHoverCard && this.setState({ showPopover: true })}
                onMouseLeave={() => this.setState({ showPopover: false })}
            >
                <h4>{table.display_name}</h4>
                { showPopover && <TableHoverCard table={table} /> }
            </div>
        )
    }
}

class TableList extends Component {
    render ()  {
        const { tables, showHoverCard } = this.props
        return (
            <ol className="Grid Grid--1of3">
                { tables.map(table =>
                    <li
                        className="Grid-cell"
                        key={table.id}
                    >
                        <DataModelTableLink
                            id={table.id}
                            style={{ textDecoration: 'none' }}
                        >
                            <div className="bg-brand-hover text-white-hover rounded p1">
                                <TableListItem table={table} showHoverCard={showHoverCard} />
                            </div>
                        </DataModelTableLink>
                    </li>
                )}
            </ol>
        )
    }
}

const mapStateToProps = (state, props) => ({
    tables: getTablesByDatabaseId(state, props.params.databaseId),
})

export default withBreadcrumbs(connect(mapStateToProps, { fetchSegments })(DatabaseData))
