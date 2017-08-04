/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import {
    fetchSegmentFingerPrint,
    changeCost
} from 'metabase/reference/reference'

import Icon from 'metabase/components/Icon'
import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getSegmentConstituents,
    getSegmentFingerprint
} from 'metabase/reference/selectors'

import Constituent from 'metabase/xray/components/Constituent'

type Props = {
    fetchSegmentFingerPrint: () => void,
    fingerprint: {}
}

const mapStateToProps = state => ({
    fingerprint: getSegmentFingerprint(state),
    constituents: getSegmentConstituents(state)
})

const mapDispatchToProps = {
    fetchSegmentFingerPrint,
    changeCost
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.segment.name || "Segment" )
class SegmentXRay extends Component {
    props: Props

    componentDidMount () {
        this.fetchSegmentFingerPrint()
    }

    fetchSegmentFingerPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        this.props.fetchSegmentFingerPrint(params.segmentId, cost)
    }

    componentDidUpdate (prevProps) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchSegmentFingerPrint()
        }
    }

    changeCost = (cost) => {
        const { params } = this.props
        // TODO - this feels kinda icky, would be nice to be able to just pass cost
        this.props.changeCost(`segment/${params.segmentId}/${cost}`)
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
                                    <Link
                                        className="my2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration shadowed rounded"
                                        to={`/xray/table/${fingerprint.table.id}/approximate`}
                                    >
                                        <div className="flex align-center">
                                            <Icon name="chevronleft" />
                                            {fingerprint.table.display_name}
                                        </div>
                                    </Link>
                                    <h1>{ fingerprint.segment.name } XRay</h1>
                                    <p className="m0 text-paragraph text-measure">
                                        {fingerprint.segment.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        onChange={this.changeCost}
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
