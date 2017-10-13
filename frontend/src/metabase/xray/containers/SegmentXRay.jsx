/* @flow */
import React, { Component } from 'react'
import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { Link } from 'react-router'
import { push } from "react-router-redux";

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'
import { fetchXray, initialize } from 'metabase/xray/xray'

import Icon from 'metabase/components/Icon'
import CostSelect from 'metabase/xray/components/CostSelect'

import {
    getConstituents,
    getLoadingStatus,
    getError,
    getFeatures,
    getComparables
} from 'metabase/xray/selectors'

import Constituent from 'metabase/xray/components/Constituent'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import type { Table } from 'metabase/meta/types/Table'
import type { Segment } from 'metabase/meta/types/Segment'

import { hasXray, xrayLoadingMessages } from 'metabase/xray/utils'
import Select, { Option } from "metabase/components/Select";

type Props = {
    fetchXray: () => void,
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
    error: {}
}

const mapStateToProps = state => ({
    features:       getFeatures(state),
    constituents:   getConstituents(state),
    comparables:    getComparables(state),
    isLoading:      getLoadingStatus(state),
    error:          getError(state)
})

const mapDispatchToProps = {
    initialize,
    fetchXray,
    push
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ features }) => features && features.model.name || "Segment" )
class SegmentXRay extends Component {

    props: Props

    componentWillMount () {
        this.props.initialize()
        this.fetch()
    }

    componentWillUnmount() {
        // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.features` isn't same
        // for all xray types and if switching to different kind of xray (= rendering different React container)
        // without resetting the state fails because `state.xray.features` subproperty lookups fail
        this.props.initialize();
    }

    fetch () {
        const { params, fetchXray } = this.props
        fetchXray('segment', params.segmentId, params.cost)
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetch()
        }
    }

    navigateToComparison(comparable) {
        const { features, push } = this.props

        const currentModelType = features.model["type-tag"]
        const comparableModelType = comparable["type-tag"]

        if (currentModelType === comparableModelType) {
            push(`/xray/compare/${currentModelType}s/${features.model.id}/${comparable.id}/approximate`)
        } else {
            push(`/xray/compare/${currentModelType}/${features.model.id}/${comparableModelType}/${comparable.id}/approximate`)
        }
    }

    render () {
        const { constituents, features, comparables, params, isLoading, error } = this.props
        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !hasXray(features)}
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
                                        to={`/xray/table/${features.table.id}/approximate`}
                                    >
                                        {features.table.display_name}
                                    </Link>
                                    <h1 className="mt2 flex align-center">
                                        {features.model.name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">X-ray</span>
                                    </h1>
                                    <p className="mt1 text-paragraph text-measure">
                                        {features.model.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        currentCost={params.cost}
                                        xrayType='segment'
                                        id={features.model.id}
                                    />
                                </div>
                            </div>
                            <div>
                                { comparables &&
                                    <Select
                                        value={null}
                                        // TODO Atte Keinänen: Use links instead of this kind of logic
                                        onChange={e => this.navigateToComparison(e.target.value)}
                                        triggerElement={
                                            <div className="Button bg-white text-brand-hover no-decoration">
                                                <Icon name="compare" className="mr1" />
                                                {`Compare with...`}
                                                <Icon name="chevrondown" size={12} className="ml1" />
                                            </div>
                                        }
                                    >
                                        { comparables
                                            // NOTE: filter out card comparisons because we don't support those yet
                                            .filter((comparableModel) => !comparableModel["type-tag"].includes("card"))
                                            .map((comparableModel, index) =>
                                                <Option
                                                    key={index}
                                                    value={comparableModel}
                                                    // icon={collection.id != null ? "collection" : null}
                                                    // iconColor={collection.color}
                                                    // iconSize={18}
                                                >
                                                    {comparableModel.name}
                                                </Option>
                                        )}
                                    </Select>
                                }
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
