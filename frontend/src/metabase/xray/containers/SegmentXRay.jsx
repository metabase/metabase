/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import { fetchSegmentThumbPrint } from 'metabase/reference/reference'

import Icon from 'metabase/components/Icon'
import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getSegmentConstituents,
    getSegmentThumbprint
} from 'metabase/reference/selectors'

import Constituent from 'metabase/xray/components/Constituent'

import type { Table } from 'metabase/meta/types/Table'
import type { Segment } from 'metabase/meta/types/Segment'

type Props = {
    fetchSegmentThumbPrint: () => void,
    constituents: [],
    thumbprint: {
        table: Table,
        segment: Segment,
    },
    params: {
        segmentId: number,
        cost: string,
    }
}

const mapStateToProps = state => ({
    thumbprint: getSegmentThumbprint(state),
    constituents: getSegmentConstituents(state)
})

const mapDispatchToProps = {
    fetchSegmentThumbPrint
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ thumbprint }) => thumbprint && thumbprint.segment.name || "Segment" )
class SegmentXRay extends Component {
    props: Props

    state = {
        error: null
    }

    componentDidMount () {
        this.fetchSegmentThumbPrint()
    }

    async fetchSegmentThumbPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        try {
            await this.props.fetchSegmentThumbPrint(params.segmentId, cost)
        } catch (error) {
            this.setState({ error })
        }
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchSegmentThumbPrint()
        }
    }

    render () {
        const { constituents, thumbprint, params } = this.props
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
                                        to={`/xray/table/${thumbprint.table.id}/approximate`}
                                    >
                                        {thumbprint.table.display_name}
                                    </Link>
                                    <h1 className="mt2 flex align-center">
                                        {thumbprint.segment.name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">XRay</span>
                                    </h1>
                                    <p className="mt1 text-paragraph text-measure">
                                        {thumbprint.segment.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        xrayType='segment'
                                        id={thumbprint.segment.id}
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
