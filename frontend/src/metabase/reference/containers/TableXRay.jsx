/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'

import { fetchTableFingerPrint } from 'metabase/reference/reference'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import SimpleHistogram from 'metabase/xray/SimpleHistogram'
import SimpleStat from 'metabase/xray/SimpleStat'

type Props = {
    fetchTableFingerPrint: () => void,
    fingerprint: {}
}

const FingerPrintList = ({ fingerprint }) =>
    <div>
        <ol className="full">
            { Object.keys(fingerprint).map(fieldName => {
                const f = fingerprint[fieldName]
                return (
                    <li key={fieldName}>
                        <h4>{fieldName}</h4>
                        <div>
                            <SimpleHistogram
                                data={f.histogram}
                                height={40}
                                gridLines={false}
                                legends={false}
                            />
                            <ol className="Grid">
                                <li className="Grid-cell">
                                    <SimpleStat name="Min" data={f.min} />
                                </li>
                                <li className="Grid-cell">
                                    <SimpleStat name="Skewness" data={f.skewness} />
                                </li>
                                <li className="Grid-cell">
                                    <SimpleStat name="Mean" data={f.mean} />
                                </li>
                            </ol>
                        </div>
                    </li>
                )
            })}
        </ol>
    </div>

const FingerprintGrid = ({ fingerprint }) =>
    <div className="full">
        <ol>
            <li className="border-bottom border-dark">
                <ol className="Grid Grid--gutters">
                    <li className="Grid-cell">
                        <h3>Field</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Skewness</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>All distinct?</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Has nils?</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Mean</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Min</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Max</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Median</h3>
                    </li>
                    <li className="Grid-cell">
                        <h3>Distribution</h3>
                    </li>
                </ol>
            </li>
            { Object.keys(fingerprint).map(key => {
                const field = fingerprint[key]
                return (
                    <li className="border-bottom">
                        <ol className="Grid Grid--gutters">
                            <li className="Grid-cell">
                                <a className="link text-bold">{key}</a>
                            </li>
                            <li className="Grid-cell">
                                { field.skewness }
                            </li>
                            <li className="Grid-cell">
                                { field['has-nils?'] }
                            </li>
                            <li className="Grid-cell">
                                { field['all-distinct?'] }
                            </li>
                            <li className="Grid-cell">
                                { field.mean }
                            </li>
                            <li className="Grid-cell">
                                { field.min }
                            </li>
                            <li className="Grid-cell">
                                { field.max }
                            </li>
                            <li className="Grid-cell">
                                { field.median }
                            </li>
                            <li className="Grid-cell">
                                <SimpleHistogram
                                    data={field.histogram}
                                    gridLines={false}
                                    height={30}
                                    legends={false}
                                />
                            </li>
                        </ol>
                    </li>
                )
            })}
        </ol>
    </div>

class TableXRay extends Component {
    props: Props

    state = {
        grid: true
    }

    componentDidMount () {
        this.props.fetchTableFingerPrint(this.props.params.tableId)
    }


    render () {
        const { fingerprint } = this.props
        return (
            <div className="wrapper">
                <h2>Fingerprint</h2>
                <LoadingAndErrorWrapper loading={!fingerprint}>
                    { () =>
                        <div className="full">
                            { this.state.grid ?(
                                <div className="mt3">
                                    <FingerprintGrid fingerprint={fingerprint} />
                                </div>
                            )
                            : (
                                <FingerPrintList fingerprint={fingerprint} />
                            )}
                            <pre>

                                <code>
                                    { JSON.stringify(fingerprint, null, 2) }
                                </code>
                            </pre>
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}

const mapStateToProps = state => ({
    fingerprint: state.reference.tableFingerprint,
})

const mapDispatchToProps = {
    fetchTableFingerPrint: fetchTableFingerPrint
}

export default connect(mapStateToProps, mapDispatchToProps)(TableXRay)
