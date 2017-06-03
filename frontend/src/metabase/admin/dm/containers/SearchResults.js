import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import Metric from "metabase-lib/lib/metadata/Metric";

import DataModelTableLink from './DataModelTableLink'

import {
    getDatabaseById,
    getMetricsByDatabaseId
} from 'metabase/selectors/metadata'

class SearchResults extends Component {

    renderSearchListItem = (item) => {
        if(item instanceof Metric) {
            return (
                <li>
                    <Link to={``}>
                        {item.name}
                    </Link>
                </li>
            )
        }
        return (
            <li>
                <DataModelTableLink id={item.id}>
                    <div className="bg-brand-hover text-white-hover py1 cursor-pointer">
                        {item.display_name}
                    </div>
                </DataModelTableLink>
            </li>
        )
    }

    render () {
        return (
            <ol className="bordered rounded bg-white shadowed">
                { this.props.searchList
                        .filter(({ name }) =>
                            name.toLowerCase().indexOf(this.props.searchString.toLowerCase()) != -1
                        )
                        .map(item =>
                            this.renderSearchListItem(item)
                        )
                }
            </ol>
        )
    }
}

const mapStateToProps = (state, { params }) => {
    const id = params.databaseId
    return {
        searchList: [
            ...getDatabaseById(state, id).tables,
            ...getMetricsByDatabaseId(state, id)
        ]
    }
}

export default withRouter(connect(mapStateToProps)(SearchResults))

