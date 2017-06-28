/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import type { Field } from 'metabase/meta/types/Field'

import { fetchFieldFingerPrint } from 'metabase/reference/reference'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import SimpleHistogram from 'metabase/xray/SimpleHistogram'
import SimpleStat from 'metabase/xray/SimpleStat'

type Props = {
    fetchFieldFingerPrint: () => void,
    fingerprint: {}
}

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
            <div className="wrapper" style={{ maxWidth: 920 }}>
                <LoadingAndErrorWrapper loading={!fingerprint}>
                    { () =>
                        <div className="full">

                            <div className="my4">
                                <h1>
                                   {fingerprint.field.display_name} stats
                               </h1>
                           </div>
                            <div className="mt4">
                                <h3 className="py2 border-bottom">Distribution</h3>
                                <div className="my4">
                                    <SimpleHistogram data={fingerprint.histogram} />
                                </div>
                            </div>
                            <div>
                                <h3 className="py2 border-bottom mb3">Numbers</h3>
                                <ol className="Grid Grid--1of4 Grid--gutters mt4 mb4">
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.max} label="Max" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.min} label="Min" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.mean} label="Mean" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.median} label="Median" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.count} label="Count" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.sum} label="Sum" />
                                    </li>
                                    <li className="Grid-cell">
                                        <SimpleStat stat={fingerprint.range} label="Range" />
                                    </li>
                                </ol>
                            </div>

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
                    }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}

const mapStateToProps = state => ({
    fingerprint: state.reference.fieldFingerprint,
})

const mapDispatchToProps = {
    fetchFieldFingerPrint: fetchFieldFingerPrint
}

export default connect(mapStateToProps, mapDispatchToProps)(FieldXRay)
