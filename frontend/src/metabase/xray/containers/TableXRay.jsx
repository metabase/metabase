/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { fetchXray, initialize } from 'metabase/xray/xray'
import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import { push } from "react-router-redux";

import CostSelect from 'metabase/xray/components/CostSelect'
import Constituent from 'metabase/xray/components/Constituent'

import {
    getConstituents,
    getFeatures,
    getLoadingStatus,
    getError, getComparables
} from 'metabase/xray/selectors'

import Icon from 'metabase/components/Icon'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import type { Table } from 'metabase/meta/types/Table'

import { hasXray, xrayLoadingMessages } from 'metabase/xray/utils'
import Select, { Option } from "metabase/components/Select";

type Props = {
    fetchXray: () => void,
    initialize: () => {},
    constituents: [],
    isLoading: boolean,
    xray: {
        table: Table
    },
    params: {
        tableId: number,
        cost: string
    },
    error: {}
}

const mapStateToProps = state => ({
    features: getFeatures(state),
    constituents: getConstituents(state),
    comparables: getComparables(state),
    isLoading: getLoadingStatus(state),
    error: getError(state)
})

const mapDispatchToProps = {
    initialize,
    fetchXray,
    push
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ features }) => features && features.model.display_name || "Table")
class TableXRay extends Component {

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
        const { params, fetchXray } = this.props
        // TODO this should happen at the action level
        fetchXray('table', params.tableId, params.cost)
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

        push(`/xray/compare/${comparableModelType}/${comparable.id}/${currentModelType}/${features.model.id}/approximate`)
    }

    render () {
        const { comparables, constituents, features, params, isLoading, error } = this.props

        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !hasXray(features)}
                error={error}
                noBackground
                loadingMessages={xrayLoadingMessages}
                loadingScenes={[<LoadingAnimation />]}
            >
                { () =>
                    <XRayPageWrapper>
                        <div className="full">
                            <div className="my4 flex align-center py2">
                                <div>
                                    <h1 className="mt2 flex align-center">
                                        {features.model.display_name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">XRay</span>
                                    </h1>
                                    <p className="m0 text-paragraph text-measure">{features.model.description}</p>
                                </div>
                                <div className="ml-auto flex align-center">
                                   <h3 className="mr2">Fidelity:</h3>
                                    <CostSelect
                                        xrayType='table'
                                        currentCost={params.cost}
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
                                        .filter((comparableModel) => !comparableModel["type-tag"].includes("card") && !comparableModel["type-tag"].includes("table"))
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
                    </XRayPageWrapper>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default TableXRay
