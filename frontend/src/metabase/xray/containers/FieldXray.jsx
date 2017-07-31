/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from "metabase/hoc/Title";

import { fetchFieldFingerPrint } from 'metabase/reference/reference'

import { getFieldFingerprint } from 'metabase/reference/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import SimpleHistogram from 'metabase/xray/SimpleHistogram'
import SimpleStat from 'metabase/xray/SimpleStat'

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
    fetchFieldFingerPrint
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ fingerprint }) => fingerprint && fingerprint.field.display_name || "Field")
class FieldXRay extends Component {
    props: Props

    state = {
        showRaw: false,
    }

    componentDidMount () {
        this.props.fetchFieldFingerPrint(this.props.params.fieldId)
    }

    render () {
        const { fingerprint } = this.props
        return (
            <div className="wrapper" style={{ paddingLeft: '6em', paddingRight: '6em' }}>
                <div className="full">
                    <LoadingAndErrorWrapper loading={!fingerprint}>
                        { () => {
                            return (
                                <div className="full">

                                    <div className="my4">
                                        <h1>
                                           {fingerprint.field.display_name} stats
                                       </h1>
                                   </div>
                                    <div className="mt4">
                                        <h3 className="py2 border-bottom">Distribution</h3>
                                        <div className="my4">
                                            <SimpleHistogram data={fingerprint.histogram} legends={false} />
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

                                    <ol className="Grid Grid--1of3 Grid--gutters my4 py4">
                                        { fingerprint['histogram-day'] && (
                                            <li className="Grid-cell">
                                                <Heading heading="Day" />
                                                <SimpleHistogram data={fingerprint['histogram-day']} />
                                            </li>
                                        )}
                                        { fingerprint['histogram-month'] && (
                                            <li className="Grid-cell">
                                                <Heading heading="Month" />
                                                <SimpleHistogram data={fingerprint['histogram-month']} />
                                            </li>
                                        )}
                                        { fingerprint['histogram-quarter'] && (
                                            <li className="Grid-cell">
                                                <Heading heading="Quarter" />
                                                <SimpleHistogram data={fingerprint['histogram-quarter']} />
                                            </li>
                                        )}
                                    </ol>

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


