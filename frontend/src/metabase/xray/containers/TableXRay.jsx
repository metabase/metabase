/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { fetchTableFingerPrint } from 'metabase/reference/reference'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'

import COSTS from 'metabase/xray/costs'

import CostSelect from 'metabase/xray/components/CostSelect'
import Constituent from 'metabase/xray/components/Constituent'

import {
    getTableConstituents,
    getTableFingerprint
} from 'metabase/reference/selectors'

import Icon from 'metabase/components/Icon'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import type { Table } from 'metabase/meta/types/Table'

type Props = {
    constituents: [],
    fetchTableFingerPrint: () => void,
    fingerprint: {
        table: Table
    },
    params: {
        tableId: number,
        cost: string
    }
}

const mapStateToProps = state => ({
    fingerprint: getTableFingerprint(state),
    constituents: getTableConstituents(state)
})

const mapDispatchToProps = {
    fetchTableFingerPrint
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.table.display_name || "Table")
class TableXRay extends Component {
    props: Props

    state = {
        error: null
    }

    componentDidMount () {
        this.fetchTableFingerPrint()
    }

    async fetchTableFingerPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        try {
            await this.props.fetchTableFingerPrint(params.tableId, cost)
        } catch (error) {
            this.setState({ error })
        }
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchTableFingerPrint()
        }
    }

    render () {
        const { constituents, fingerprint, params } = this.props
        const { error } = this.state

        return (
            <XRayPageWrapper>
                <LoadingAndErrorWrapper
                    loading={!constituents}
                    error={error}
                    noBackground
                >
                    { () =>
                        <div className="full">
                            <div className="my4 flex align-center py2">
                                <div>
                                    <h1 className="mt2 flex align-center">
                                        {fingerprint.table.display_name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">XRay</span>
                                    </h1>
                                    <p className="m0 text-paragraph text-measure">{fingerprint.table.description}</p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2">Fidelity:</h3>
                                    <CostSelect
                                        xrayType='table'
                                        currentCost={params.cost}
                                        id={fingerprint.table.id}
                                    />
                                </div>
                            </div>
                            <ol>
                                { constituents.map((constituent, index) =>
                                    <li key={index}>
                                        <Constituent
                                            constituent={constituent}
                                        />
                                    </li>
                                )}
                            </ol>
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </XRayPageWrapper>
        )
    }
}

export default TableXRay
