import React, { Component } from 'react'
import { connect } from 'react-redux'

import TableLikeComparison from "metabase/xray/containers/TableLikeComparison";
import title from 'metabase/hoc/Title'

import { fetchTableComparison } from 'metabase/xray/xray'
import { getTitle } from 'metabase/xray/selectors'

const mapDispatchToProps = {
    fetchTableComparison
}

@connect(null, mapDispatchToProps)
@title(props => getTitle(props))
class TableComparison extends Component {
    render () {
        const { cost, tableId1, tableId2 } = this.props.params

        return (
            <TableLikeComparison
                cost={cost}
                fetchTableLikeComparison={
                    () => this.props.fetchTableComparison(tableId1, tableId2, cost)
                }
            />
        )
    }
}

export default TableComparison

