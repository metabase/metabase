import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getDatabaseById } from 'metabase/selectors/metadata'

import {
    getQuery,
} from "../selectors";

import StructuredQuery from "metabase-lib/lib/StructuredQuery";

type Props = {
    query: StructuredQuery,
}

class NewQuestionBar extends Component {
    props: Props

    render () {
        const { query } = this.props
        const database = query.database()
        const table = query.table()
        return (
            <div className="bordered rounded shadowed py2">
                <ol className="flex align-center">
                    <li>{ database ? database.name : 'Select a database'}</li>
                    <li>{ table ? table.display_name : 'Select a table' }</li>
                    <li>{ database && table && <div className="input">Super cool aggregation box</div>}</li>
                </ol>
            </div>
        )
    }
}

const mapStateToProps = state => ({
    query: getQuery(state)
})

export default connect(mapStateToProps)(NewQuestionBar)
