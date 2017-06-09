/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'

import StructuredQuery from "metabase-lib/lib/StructuredQuery";

import { getQuery } from "../selectors";

type Props = {
    query: StructuredQuery
}

class NewQuestionBar extends Component {

    props: Props

    render () {

        const { query } = this.props
        const database = query && query.database()
        const table = query && query.table()

        return (
            <ol className="bordered rounded shadowed py2 flex align-center">
                <li>{ database ? database.name : 'Select a database'}</li>
                <li>{ table ? table.display_name : 'Select a table' }</li>
                { database && table && (
                    <li>
                        <div className="input">
                            Super cool aggregation box
                        </div>
                    </li>
                )}
            </ol>
        )
    }
}

const mapStateToProps = state => ({
    query: getQuery(state)
})

export default connect(mapStateToProps)(NewQuestionBar)
