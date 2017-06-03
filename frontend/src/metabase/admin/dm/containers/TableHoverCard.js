import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchTableMetadata } from 'metabase/redux/metadata'

import Popover from 'metabase/components/Popover'

class TableHoverCard extends Component {
    componentDidMount () {
        this.props.fetchTableMetadata(this.props.table.id)
    }
    render () {
        const { table } = this.props
        return (
            <Popover>
                <div className="p2">
                    <h5>Description:</h5>
                    {table.description ? table.description : 'No description'}
                    <ol>
                        <li><h5>Fields:</h5> <span>{ table.fields.length }</span></li>
                        <li><h5>Segments:</h5> <span>{ table.segments.length }</span></li>
                    </ol>
                </div>
            </Popover>
        )

    }
}

export default connect(() => ({}), { fetchTableMetadata })(TableHoverCard)
