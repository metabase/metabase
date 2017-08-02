/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'
import { Link } from 'react-router'

import { fetchFieldFingerPrint, changeCost } from 'metabase/reference/reference'

import { getFieldFingerprint } from 'metabase/reference/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import Histogram from 'metabase/xray/Histogram'
import SimpleStat from 'metabase/xray/SimpleStat'

import { isDate } from 'metabase/lib/schema_metadata'

const PERIODICITY = ['day', 'week', 'month', 'hour', 'quarter']

type Props = {
    fetchFieldFingerPrint: () => void,
    fingerprint: {},
    params: {},
}

const StatGroup = ({ fingerprint, stats, showDescriptions }) =>
    <ol className="Grid Grid--1of3">
        { stats.map(stat =>
            fingerprint[stat] && (
                <li className="Grid-cell p4 border-right border-bottom" key={stat}>
                    <SimpleStat
                        stat={fingerprint[stat]}
                        showDescription={showDescriptions}
                    />
                </li>
            )
        )}
    </ol>


const Heading = ({ heading }) =>
    <h2 className="py3">{heading}</h2>

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

    changeCost = ({ target }) => {
        const { params } = this.props
        // TODO - this feels kinda icky, would be nice to be able to just pass cost
        this.props.changeCost(`field/${params.fieldId}/${target.value}`)
    }

    render () {
        const { fingerprint, params } = this.props
        return (
            <div className="wrapper bg-slate-extra-light" style={{ paddingLeft: '6em', paddingRight: '6em' }}>
                <div className="full">
                    <LoadingAndErrorWrapper loading={!fingerprint}>
                        { () => {
                            return (
                                <div className="full">

                                    <div className="my4 flex align-center">
                                        <div>
                                            <Link
                                                className="my2"
                                                to={`/xray/table/${fingerprint.table.id}/approximate`}
                                            >
                                                {fingerprint.table.display_name}
                                            </Link>
                                            <h1 className="m0">
                                               {fingerprint.field.display_name} stats
                                           </h1>
                                           <p className="text-paragraph text-measure">{fingerprint.field.description}</p>
                                       </div>
                                       <div className="ml-auto">
                                           Fidelity:
                                           <CostSelect
                                               currentCost={params.cost}
                                               onChange={this.changeCost}
                                           />
                                       </div>
                                   </div>
                                    <div className="mt4">
                                        <Heading heading="Distribution" />
                                        <div className="bg-white bordered shadowed">
                                            <div className="p4">
                                            <div style={{ height: 300 }}>
                                                <Histogram histogram={fingerprint.histogram.value} />
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                    {
                                        /*
                                        * If the field is a date field we show more information about the periodicity
                                        * */

                                        isDate(fingerprint.field) && (
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
                                        )
                                    }

                                    <div className="my4">
                                        <Heading heading="Values overview" />
                                        <div className="bordered rounded shadowed bg-white">
                                            <StatGroup
                                                fingerprint={fingerprint}
                                                stats={[
                                                    'min',
                                                    'max',
                                                    'count',
                                                    'sum',
                                                    'cardinality',
                                                    'sd',
                                                    'nil%',
                                                    'mean',
                                                    'median',
                                                    'mean-median-spread'
                                                ]}
                                            />
                                        </div>
                                    </div>


                                    <div className="my4">
                                        <Heading heading="Statistical overview" />
                                        <div className="bordered rounded shadowed bg-white">
                                            <StatGroup
                                                fingerprint={fingerprint}
                                                showDescriptions
                                                stats={[
                                                    'kurtosis',
                                                    'skewness',
                                                    'entropy',
                                                    'var',
                                                    'sum-of-square',
                                                ]}
                                            />
                                        </div>
                                    </div>

                                    <div className="my4">
                                        <Heading heading="What the Robots say" />
                                        <div className="bordered rounded shadowed bg-white">
                                            <StatGroup
                                                fingerprint={fingerprint}
                                                showDescriptions
                                                stats={[
                                                    'cardinality-vs-count',
                                                    'positive-definite?',
                                                    'has-nils?',
                                                    'all-distinct?',
                                                ]}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        }}
                    </LoadingAndErrorWrapper>
                </div>
            </div>
        )
    }
}

export default FieldXRay


