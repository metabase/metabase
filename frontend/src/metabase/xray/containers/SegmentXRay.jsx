/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'
import { fetchSegmentXray, initialize } from 'metabase/xray/xray'

import Icon from 'metabase/components/Icon'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getConstituents,
    getLoadingStatus,
    getError,
    getFeatures, getIsAlreadyFetched
} from 'metabase/xray/selectors'

import Constituent from 'metabase/xray/components/Constituent'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import type { Table } from 'metabase/meta/types/Table'
import type { Segment } from 'metabase/meta/types/Segment'

import { xrayLoadingMessages } from 'metabase/xray/utils'

type Props = {
    fetchSegmentXray: () => void,
    initialize: () => {},
    constituents: [],
    xray: {
        table: Table,
        segment: Segment,
    },
    params: {
        segmentId: number,
        cost: string,
    },
    isLoading: boolean,
    isAlreadyFetched: boolean,
    error: {}
}

const mapStateToProps = state => ({
    xray:           getFeatures(state),
    constituents:   getConstituents(state),
    isLoading:      getLoadingStatus(state),
    isAlreadyFetched: getIsAlreadyFetched(state),
    error:          getError(state)
})

const mapDispatchToProps = {
    initialize,
    fetchSegmentXray
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ xray }) => xray && xray.segment.name || "Segment" )
class SegmentXRay extends Component {

    props: Props

    componentWillMount () {
        this.props.initialize()
        this.fetch()
    }

    componentWillUnmount() {
        // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
        // for all xray types and if switching to different kind of xray (= rendering different React container)
        // without resetting the state fails because `state.xray.xray` subproperty lookups fail
        this.props.initialize();
    }

    fetch () {
        const { params, fetchSegmentXray } = this.props
        fetchSegmentXray(params.segmentId, params.cost)
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetch()
        }
    }

    render () {
        const { constituents, xray, params, isLoading, isAlreadyFetched, error } = this.props
        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !isAlreadyFetched}
                error={error}
                loadingMessages={xrayLoadingMessages}
                loadingScenes={[
                    <LoadingAnimation />
                ]}
                noBackground
            >
                { () =>
                    <XRayPageWrapper>
                        <div className="full">
                            <div className="mt4 mb2 flex align-center py2">
                                <div>
                                    <Link
                                        className="my2 px2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration shadowed rounded"
                                        to={`/xray/table/${xray.table.id}/approximate`}
                                    >
                                        {xray.table.display_name}
                                    </Link>
                                    <h1 className="mt2 flex align-center">
                                        {xray.segment.name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">X-ray</span>
                                    </h1>
                                    <p className="mt1 text-paragraph text-measure">
                                        {xray.segment.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        xrayType='segment'
                                        id={xray.segment.id}
                                    />
                                </div>
                            </div>
                            <div>
                                <Link
                                    to={`/xray/compare/segment/${xray.segment.id}/table/${xray.table.id}/approximate`}
                                    className="Button bg-white text-brand-hover no-decoration"
                                >
                                    <Icon name="compare" className="mr1" />
                                    {`Compare with all ${xray.table.display_name}`}
                                </Link>
                            </div>
                            <div className="mt2">
                                <Heading heading="Fields in this segment" />
                                <ol>
                                    { constituents.map((c, i) => {
                                        return (
                                            <li key={i}>
                                                <Constituent
                                                    constituent={c}
                                                />
                                            </li>
                                        )
                                    })}
                                </ol>
                            </div>
                        </div>
                    </XRayPageWrapper>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentXRay
