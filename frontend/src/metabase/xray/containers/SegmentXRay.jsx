/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'
import { fetchSegmentXray } from 'metabase/xray/xray'

import Icon from 'metabase/components/Icon'
import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getSegmentConstituents,
    getSegmentXray
} from 'metabase/xray/selectors'

import Constituent from 'metabase/xray/components/Constituent'

import type { Table } from 'metabase/meta/types/Table'
import type { Segment } from 'metabase/meta/types/Segment'

type Props = {
    fetchSegmentXray: () => void,
    constituents: [],
    xray: {
        table: Table,
        segment: Segment,
    },
    params: {
        segmentId: number,
        cost: string,
    }
}

const mapStateToProps = state => ({
    xray: getSegmentXray(state),
    constituents: getSegmentConstituents(state)
})

const mapDispatchToProps = {
    fetchSegmentXray
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ xray }) => xray && xray.segment.name || "Segment" )
class SegmentXRay extends Component {
    props: Props

    state = {
        error: null
    }

    componentDidMount () {
        this.fetchSegmentXray()
    }

    async fetchSegmentXray () {
        const { params } = this.props
        // TODO - this should happen in the action
        const cost = COSTS[params.cost]
        try {
            await this.props.fetchSegmentXray(params.segmentId, cost)
        } catch (error) {
            this.setState({ error })
        }
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchSegmentXray()
        }
    }

    render () {
        const { constituents, xray, params } = this.props
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
                                        <span className="text-grey-3">XRay</span>
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
                    }
                </LoadingAndErrorWrapper>
            </XRayPageWrapper>
        )
    }
}

export default SegmentXRay
