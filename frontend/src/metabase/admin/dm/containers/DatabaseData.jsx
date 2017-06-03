import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import { getTablesByDatabaseId } from 'metabase/selectors/metadata'

import DataModelTableLink from './DataModelTableLink'
import withBreadcrumbs from './WithBreadcrumbs'

class DatabaseData extends Component {
    render () {
        // do some logic here
        return <TableList tables={this.props.tables} path={this.props.location.pathname} />
    }
}


const TableList = ({ tables, path }) =>
    <div>
        <ol className="flex full my2 align-center">
            { tables && Object.keys(tables).map(key =>
                <li className="flex-full text-align-center">
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
                    className="block full"
                    key={key}
                >
                    <div className="border-bottom pb1 mb2">
                        <h2>{ key.toUpperCase() }</h2>
                    </div>
                    <ol className="Grid Grid--gutters Grid--1of3">
                        { tables[key].map(({ id, display_name, ...rest }) =>
                            <li className="Grid-cell" key={id}>
                                 <DataModelTableLink id={id}>
                                     <h3>{display_name}</h3>
                                     { rest.segments.length }
                                </DataModelTableLink>
                            </li>
                        )}
                    </ol>
                </li>
            )}
        </ol>
    </div>

const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']


const sortAlphabetically = (array, key) => {
    let sorted = {}
    array.map(item => {
        let char = item.name.charAt(0)
        if(sorted[char]) {
            // if the letter is already here we just add an item to the other items
          sorted[char] = sorted[char].concat([item])
        } else {
            // we have to dynamically add the letter to the array
            sorted = Object.assign({}, sorted, {
                [char]: [item]
            })
        }
        return false
    })
    return sorted
}

const mapStateToProps = (state, props) => ({
    tables: sortAlphabetically(
        getTablesByDatabaseId(state, props.params.databaseId),
        'name'
    )
})

export default withBreadcrumbs(connect(mapStateToProps)(DatabaseData))
