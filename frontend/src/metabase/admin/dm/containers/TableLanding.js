/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getTableById, } from 'metabase/selectors/metadata'
import { fetchTableMetadata } from 'metabase/redux/metadata'

import DataModelFieldLink from './DataModelFieldLink'
import withBreadcrumbs from './WithBreadcrumbs'

import ColumnItem from 'metabase/admin/datamodel/components/database/ColumnItem'

import Icon from 'metabase/components/Icon'
import Card from '../components/Card'

export class TableLanding extends Component {
    state = {
        editing: false
    }

    componentDidMount () {
        this.props.fetchTableMetadata(this.props.params.tableId)
    }

    render () {
        const { table } = this.props
        const { editing } = this.state

        return (
            <div>
                <div className="py4 flex align-center">
                    <div>
                        <h1>{ table && table.display_name}</h1>
                        <p>{ table && table.description}</p>
                    </div>
                    <div className="ml-auto">
                        { editing

                            ? (
                                <div
                                    className="Button flex align-center"
                                    onClick={() => this.setState({ editing: false }) }
                                >
                                    <Icon
                                        name="check"
                                    />
                                    Save
                                </div>
                            )
                            : (
                                <div
                                    className="Button flex align-center"
                                    onClick={() => this.setState({ editing: true }) }
                                >
                                    <Icon
                                        name="pencil"
                                    />
                                    Edit
                                </div>
                            )
                        }
                    </div>
                </div>
                <div className="border-bottom mb2 flex align-center">
                    <h4 className="mb2 mr2">Fields</h4>
                </div>
                <ol className="Grid Grid--gutters Grid--1of3">
                    { table && table.fields && table.fields.map(field =>
                        <li className="Grid-cell" key={field.id}>
                            <Card>
                                { /* <ColumnItem field={field} /> */ }
                                <DataModelFieldLink id={field.id} >
                                    <div className="p4">
                                    { editing
                                        ? (
                                            <div>
                                                <input
                                                    className="block full h3"
                                                    type="text"
                                                    value={field.display_name}
                                                />
                                                <textarea
                                                    className="block full text"
                                                    value={field.description ? field.description : 'No description yet'}
                                                />
                                            </div>
                                        )
                                        : (
                                            <div>
                                                <h3>{field.display_name}</h3>
                                                <p>
                                                    {
                                                        field.description
                                                            ? field.description
                                                            : 'No descrption yet'
                                                    }
                                                </p>
                                                <div>
                                                    <Icon name={field.icon()} />
                                                    { field.typeDisplayName() }
                                                </div>
                                            </div>
                                        )
                                    }
                                    </div>
                                </DataModelFieldLink>
                            </Card>
                        </li>
                    )}
                </ol>
            </div>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    table: getTableById(state, params.tableId),
})

export default withBreadcrumbs(
    connect(
        mapStateToProps,
        { fetchTableMetadata }
    )(TableLanding)
)
