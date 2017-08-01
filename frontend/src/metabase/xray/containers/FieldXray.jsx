/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from "metabase/hoc/Title";

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
    fingerprint: {}
}

const FieldOverview = ({ fingerprint, stats }) =>
    <ol>
        { stats.map(stat =>
            fingerprint[stat] && (
                <li className="my2">
                    <SimpleStat stat={fingerprint[stat]} label={stat} />
                </li>
            )
        )}
    </ol>


const Heading = ({ heading }) =>
    <h3 className="py2 border-bottom mb3">{heading}</h3>

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

    state = {
        showRaw: false,
    }

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
            <div className="wrapper" style={{ paddingLeft: '6em', paddingRight: '6em' }}>
                <div className="full">
                    <LoadingAndErrorWrapper loading={!fingerprint}>
                        { () => {
                            return (
                                <div className="full">

                                    <div className="my4 flex align-center">
                                        <h1>
                                           {fingerprint.field.display_name} stats
                                       </h1>
                                       <div className="ml-auto">
                                           Fidelity:
                                           <CostSelect
                                               currentCost={params.cost}
                                               onChange={this.changeCost}
                                           />
                                       </div>
                                   </div>
                                    <div className="mt4">
                                        <h3 className="py2 border-bottom">Distribution</h3>
                                        <div className="my4" style={{ height: 300, width: '100%' }}>
                                            <Histogram histogram={fingerprint.histogram} />
                                        </div>
                                    </div>

                                    <Heading heading="Values overview" />
                                    <div className="Grid Grid--gutters">
                                        <div className="Grid-cell">
                                            <FieldOverview fingerprint={fingerprint} stats={['min', 'max', 'median', 'sum']} />
                                        </div>
                                        <div className="Grid-cell">
                                            <FieldOverview fingerprint={fingerprint} stats={['count', 'cardinality-vs-count', 'nil-conunt', ]} />
                                        </div>
                                        <div className="Grid-cell">
                                            <FieldOverview fingerprint={fingerprint} stats={['entropy', 'sd', 'nil-conunt', ]} />
                                        </div>
                                    </div>

                                    { isDate(fingerprint.field) && [
                                            <Heading heading="Periodicity" />,
                                            <div className="Grid Grid--gutters">
                                                { PERIODICITY.map(period =>
                                                    fingerprint[`histogram-${period}`] && (
                                                        <div className="Grid-cell" style={{ height: 120 }}>
                                                            <Histogram
                                                                histogram={fingerprint[`histogram-${period}`]}
                                                            />
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                    ]}

                                    <a className="link" onClick={() => this.setState({ showRaw: !this.state.showRaw })}>
                                        { this.state.showRaw ? 'Hide' : 'Show' } raw response (debug)
                                    </a>

                                    { this.state.showRaw && (
                                        <pre>
                                            <code>
                                                { JSON.stringify(this.props.fingerprint, null, 2) }
                                            </code>
                                        </pre>
                                    )}
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


