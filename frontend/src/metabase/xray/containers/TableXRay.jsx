/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import {
    fetchTableFingerPrint,
    changeCost
} from 'metabase/reference/reference'

import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'

import COSTS from 'metabase/xray/costs'

import CostSelect from 'metabase/xray/components/CostSelect'
import Constituent from 'metabase/xray/components/Constituent'

import {
    getTableConstituents,
    getTableFingerprint
} from 'metabase/reference/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

type Props = {
    constituents: [],
    fetchTableFingerPrint: () => void,
    fingerprint: {},
    params: {
        tableId: number
    }
}

const mapStateToProps = state => ({
    fingerprint: getTableFingerprint(state),
    constituents: getTableConstituents(state)
})

const mapDispatchToProps = {
    fetchTableFingerPrint,
    changeCost
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.table.display_name || "Table")
class TableXRay extends Component {
    props: Props

    componentDidMount () {
        this.fetchTableFingerPrint()
    }

    fetchTableFingerPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        this.props.fetchTableFingerPrint(params.tableId, cost)
    }

    componentDidUpdate (prevProps) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchTableFingerPrint()
        }
    }

    changeCost = (cost) => {
        const { params } = this.props
        // TODO - this feels kinda icky, would be nice to be able to just pass cost
        this.props.changeCost(`table/${params.tableId}/${cost}`)
    }

    render () {
        const { constituents, fingerprint, params } = this.props

        return (
            <XRayPageWrapper>
                <LoadingAndErrorWrapper
                    loading={!constituents}
                    noBackground
                >
                    { () =>
                        <div className="full">
                            <div className="my4 flex align-center py2">
                                <div>
                                    <h1>{ fingerprint.table.display_name } XRay</h1>
                                    <p className="m0 text-paragraph text-measure">{fingerprint.table.description}</p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2">Fidelity:</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        onChange={this.changeCost}
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
