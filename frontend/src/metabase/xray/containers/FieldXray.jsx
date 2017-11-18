/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'
import { Link } from 'react-router'
import { t } from 'c-3po';
import { isDate } from 'metabase/lib/schema_metadata'
import { fetchXray, initialize } from 'metabase/xray/xray'
import {
    getLoadingStatus,
    getError,
    getFeatures
} from 'metabase/xray/selectors'

import {
    ROBOTS,
    STATS_OVERVIEW,
    VALUES_OVERVIEW
} from 'metabase/xray/stats'

import Icon from 'metabase/components/Icon'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import CostSelect from 'metabase/xray/components/CostSelect'
import StatGroup from 'metabase/xray/components/StatGroup'
import Histogram from 'metabase/xray/Histogram'
import { Heading, XRayPageWrapper } from 'metabase/xray/components/XRayLayout'

import { hasXray, xrayLoadingMessages } from 'metabase/xray/utils'

import Periodicity from 'metabase/xray/components/Periodicity'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import type { Field } from 'metabase/meta/types/Field'
import type { Table } from 'metabase/meta/types/Table'

type Props = {
    fetchXray: () => void,
    initialize: () => {},
    isLoading: boolean,
    xray: {
        table: Table,
        field: Field,
        histogram: {
            value: {}
        }
    },
    params: {
        cost: string,
        fieldId: number
    },
    error: {}
}

const mapStateToProps = state => ({
    xray: getFeatures(state),
    isLoading: getLoadingStatus(state),
    error: getError(state)
})

const mapDispatchToProps = {
    initialize,
    fetchXray
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ xray }) => xray && xray.field.display_name || t`Field`)
class FieldXRay extends Component {
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

    fetch() {
        const { params, fetchXray } = this.props
        fetchXray('field', params.fieldId, params.cost)
    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetch()
        }
    }

    render () {
        const { xray, params, isLoading, error } = this.props

        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !hasXray(xray)}
                error={error}
                noBackground
                loadingMessages={xrayLoadingMessages}
                loadingScenes={[<LoadingAnimation />]}
            >
                { () =>
                    <XRayPageWrapper>
                        <div className="full">
                            <div className="my3 flex align-center">
                                <div className="full">
                                    <Link
                                        className="my2 px2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration rounded shadowed"
                                        to={`/xray/table/${xray.table.id}/approximate`}
                                    >
                                        {xray.table.display_name}
                                    </Link>
                                    <div className="mt2 flex align-center">
                                        <h1 className="flex align-center">
                                            {xray.field.display_name}
                                            <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                            <span className="text-grey-3">{t`X-ray`}</span>
                                        </h1>
                                        <div className="ml-auto flex align-center">
                                            <h3 className="mr2 text-grey-3">{t`Fidelity`}</h3>
                                            <CostSelect
                                                xrayType='field'
                                                id={xray.field.id}
                                                currentCost={params.cost}
                                            />
                                        </div>
                                    </div>
                                    <p className="mt1 text-paragraph text-measure">
                                        {xray.field.description}
                                    </p>
                                </div>
                            </div>
                            <div className="mt4">
                                <Heading heading={t`Distribution`} />
                                <div className="bg-white bordered shadowed">
                                    <div className="lg-p4">
                                        <div style={{ height: 300 }}>
                                            { xray.histogram.value &&
                                                <Histogram histogram={xray.histogram.value} />
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>

                            { isDate(xray.field) && <Periodicity xray={xray} /> }

                            <StatGroup
                                heading={t`Values overview`}
                                xray={xray}
                                stats={VALUES_OVERVIEW}
                            />

                            <StatGroup
                                heading={t`Statistical overview`}
                                xray={xray}
                                showDescriptions
                                stats={STATS_OVERVIEW}
                            />

                            <StatGroup
                                heading={t`Robots`}
                                xray={xray}
                                showDescriptions
                                stats={ROBOTS}
                            />
                        </div>
                    </XRayPageWrapper>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default FieldXRay
