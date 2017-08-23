/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'
import { Link } from 'react-router'

import { isDate } from 'metabase/lib/schema_metadata'
import { fetchFieldXray } from 'metabase/xray/xray'
import { getFieldXray } from 'metabase/xray/selectors'

import COSTS from 'metabase/xray/costs'

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

import Periodicity from 'metabase/xray/components/Periodicity'

import type { Field } from 'metabase/meta/types/Field'
import type { Table } from 'metabase/meta/types/Table'

type Props = {
    fetchFieldXray: () => void,
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
}

const mapStateToProps = state => ({
    xray: getFieldXray(state)
})

const mapDispatchToProps = {
    fetchFieldXray
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ xray }) => xray && xray.field.display_name || "Field")
class FieldXRay extends Component {
    props: Props

    state = {
       error: null
    }

    componentDidMount () {
        this.fetchFieldXray()
    }

    async fetchFieldXray() {
        const { params } = this.props
        const cost = COSTS[params.cost]
        try {
            await this.props.fetchFieldXray(params.fieldId, cost)
        } catch (error) {
            this.setState({ error })
        }

    }

    componentDidUpdate (prevProps: Props) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchFieldXray()
        }
    }

    render () {
        const { xray, params } = this.props
        const { error } = this.state
        return (
            <LoadingAndErrorWrapper
                loading={!xray}
                error={error}
                noBackground
            >
                { () =>
                    <XRayPageWrapper>
                        <div className="full">
                            <div className="my3 flex align-center">
                                <div>
                                    <Link
                                        className="my2 px2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration rounded shadowed"
                                        to={`/xray/table/${xray.table.id}/approximate`}
                                    >
                                        {xray.table.display_name}
                                    </Link>
                                    <h1 className="mt2 flex align-center">
                                        {xray.field.display_name}
                                        <Icon name="chevronright" className="mx1 text-grey-3" size={16} />
                                        <span className="text-grey-3">XRay</span>
                                    </h1>
                                    <p className="mt1 text-paragraph text-measure">
                                        {xray.field.description}
                                    </p>
                                </div>
                                <div className="ml-auto flex align-center">
                                    <h3 className="mr2 text-grey-3">Fidelity</h3>
                                    <CostSelect
                                        xrayType='field'
                                        id={xray.field.id}
                                        currentCost={params.cost}
                                    />
                                </div>
                            </div>
                            <div className="mt4">
                                <Heading heading="Distribution" />
                                <div className="bg-white bordered shadowed">
                                    <div className="lg-p4">
                                        <div style={{ height: 300 }}>
                                            <Histogram histogram={xray.histogram.value} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            { isDate(xray.field) && <Periodicity xray={xray} /> }

                            <StatGroup
                                heading="Values overview"
                                xray={xray}
                                stats={VALUES_OVERVIEW}
                            />

                            <StatGroup
                                heading="Statistical overview"
                                xray={xray}
                                showDescriptions
                                stats={STATS_OVERVIEW}
                            />

                            <StatGroup
                                heading="Robots"
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


