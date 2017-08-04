/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import { fetchSegmentFingerPrint } from 'metabase/reference/reference'

import Icon from 'metabase/components/Icon'
import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getSegmentConstituents,
    getSegmentFingerprint
} from 'metabase/reference/selectors'

import Constituent from 'metabase/xray/components/Constituent'

import type { Table } from 'metabase/meta/types/Table'
import type { Segment } from 'metabase/meta/types/Segment'

type Props = {
    fetchSegmentFingerPrint: () => void,
    constituents: [],
    fingerprint: {
        table: Table,
        segment: Segment,
    },
    params: {
        segmentId: number,
        cost: string,
    }
}

const mapStateToProps = state => ({
    fingerprint: getSegmentFingerprint(state),
    constituents: getSegmentConstituents(state)
})

const mapDispatchToProps = {
    fetchSegmentFingerPrint
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.segment.name || "Segment" )
class SegmentXRay extends Component {
    props: Props

    state = {
        error: null
    }

    componentDidMount () {
        this.fetchSegmentFingerPrint()
    }

    async fetchSegmentFingerPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        try {
            await this.props.fetchSegmentFingerPrint(params.segmentId, cost)
        } catch (error) {
            this.setState({ error })
        }
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchSegmentFingerPrint()
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
                                    <Link
                                        className="my2 px2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration shadowed rounded"
                                        to={`/xray/table/${fingerprint.table.id}/approximate`}
                                    >
                                        {fingerprint.table.display_name}
                                    </Link>
                                    <h1 className="mt2 flex align-center">
                                        {fingerprint.segment.name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">XRay</span>
                                    </h1>
                                    <p className="mt1 text-paragraph text-measure">
                                        {fingerprint.segment.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        xrayType='segment'
                                        id={fingerprint.segment.id}
                                    />
                                </div>
                            </div>
                            <ol>
                                { constituents.map(c => {
                                    return (
                                        <li>
                                            <Constituent
                                                constituent={c}
                                            />
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </XRayPageWrapper>
        )
    }
}

export default SegmentXRay
