/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'
import { Link } from 'react-router'

import { isDate } from 'metabase/lib/schema_metadata'
import { fetchFieldFingerPrint, changeCost } from 'metabase/reference/reference'
import { getFieldFingerprint } from 'metabase/reference/selectors'

import COSTS from 'metabase/xray/costs'

import {
    PERIODICITY,
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

type Props = {
    fetchFieldFingerPrint: () => void,
    fingerprint: {},
    params: {},
}

const Periodicity = ({fingerprint}) =>
    <div>
        <Heading heading="Time breakdown" />,
        <div className="bg-white bordered rounded shadowed">
            <div className="Grid Grid--gutters Grid--1of4">
                { PERIODICITY.map(period =>
                    fingerprint[`histogram-${period}`] && (
                        <div className="Grid-cell">
                            <div className="p4 border-right border-bottom">
                                <div style={{ height: 120}}>
                                    <h4>
                                        {fingerprint[`histogram-${period}`].label}
                                    </h4>
                                    <Histogram
                                        histogram={fingerprint[`histogram-${period}`].value}
                                    />
                                </div>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    </div>

const mapStateToProps = state => ({
    fingerprint: getFieldFingerprint(state)
})

const mapDispatchToProps = {
    fetchFieldFingerPrint,
    changeCost
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.field.display_name || "Field")
class FieldXRay extends Component {
    props: Props

    componentDidMount () {
        this.fetchFieldFingerprint()
    }

    fetchFieldFingerprint() {
        const { params } = this.props
        const cost = COSTS[params.cost]
        this.props.fetchFieldFingerPrint(params.fieldId, cost)

    }

    componentDidUpdate (prevProps) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchFieldFingerprint()
        }
    }

    changeCost = (cost) => {
        const { params } = this.props
        // TODO - this feels kinda icky, would be nice to be able to just pass cost
        this.props.changeCost(`field/${params.fieldId}/${cost}`)
    }

    render () {
        const { fingerprint, params } = this.props
        return (
            <XRayPageWrapper>
                <LoadingAndErrorWrapper
                    loading={!fingerprint}
                    noBackground
                >
                    { () =>
                        <div className="full">
                            <div className="my4 flex align-center">
                                <div>
                                    <Link
                                        className="my2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration rounded shadowed"
                                        to={`/xray/table/${fingerprint.table.id}/approximate`}
                                    >
                                        <div className="flex align-center">
                                            <Icon name="chevronleft" />
                                            {fingerprint.table.display_name}
                                        </div>
                                    </Link>
                                    <h1 className="mt2">
                                        {fingerprint.field.display_name} XRay
                                    </h1>
                                    <p className="mt0 text-paragraph text-measure">
                                        {fingerprint.field.description}
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
                            <div className="mt4">
                                <Heading heading="Distribution" />
                                <div className="bg-white bordered shadowed">
                                    <div className="lg-p4">
                                        <div style={{ height: 300 }}>
                                            <Histogram histogram={fingerprint.histogram.value} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            { isDate(fingerprint.field) && <Periodicity fingerprint={fingerprint} /> }

                            <StatGroup
                                heading="Values overview"
                                fingerprint={fingerprint}
                                stats={VALUES_OVERVIEW}
                            />

                            <StatGroup
                                heading="Statistical overview"
                                fingerprint={fingerprint}
                                showDescriptions
                                stats={STATS_OVERVIEW}
                            />

                            <StatGroup
                                heading="Robots"
                                fingerprint={fingerprint}
                                showDescriptions
                                stats={ROBOTS}
                            />
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </XRayPageWrapper>
        )
    }
}

export default FieldXRay


