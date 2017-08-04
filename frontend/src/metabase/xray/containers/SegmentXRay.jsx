/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import {
    fetchSegmentFingerPrint,
    changeCost
} from 'metabase/reference/reference'

import { Link } from 'react-router'
import Histogram from 'metabase/xray/Histogram'
import SimpleStat from 'metabase/xray/SimpleStat'

import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getSegmentConstituents,
    getSegmentFingerprint
} from 'metabase/reference/selectors'

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
@title(({ fingerprint }) => fingerprint.segment && fingerprint.segment.display_name || "Segment" )
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
        this.props.changeCost(`table/${params.segmentId}/${cost}`)
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
                                <h1>{ fingerprint.segment.display_name }</h1>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2">Fidelity:</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        onChange={this.changeCost}
                                    />
                                </div>
                                <ol>
                                    { constituents.map(c => {
                                        return (
                                            <li className="Grid my3 bg-white bordered rounded shadowed">
                                                <div className="Grid-cell Cell--1of3 border-right">
                                                    <div className="p4">
                                                        <Link
                                                            to={`xray/field/${c.field.id}/approximate`}
                                                            className="text-brand-hover link transition-text"
                                                        >
                                                            <h2 className="text-bold">{c.field.display_name}</h2>
                                                        </Link>
                                                        <p className="text-measure text-paragraph">{c.field.description}</p>

                                                        <div className="flex align-center">
                                                            { c.min && (
                                                                <SimpleStat
                                                                    stat={c.min}
                                                                />
                                                            )}
                                                            { c.max && (
                                                                <SimpleStat
                                                                    stat={c.max}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="Grid-cell p3">
                                                    <div style={{ height: 220 }}>
                                                        <Histogram histogram={c.histogram.value} />
                                                    </div>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </div>
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </XRayPageWrapper>
        )
    }
}

export default SegmentXRay
