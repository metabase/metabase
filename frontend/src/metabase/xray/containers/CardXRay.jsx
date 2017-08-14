import React, { Component } from 'react'

import { connect } from 'react-redux'

import { fetchCardXray } from 'metabase/xray/xray'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import SimpleStat from 'metabase/xray/SimpleStat'

type Props = {
    fetchCardXray: () => void,
    xray: {}
}

const XrayList = ({ xray }) =>
    <div>
        <ol className="full">
            { Object.keys(xray).map(fieldName => {
                const f = xray[fieldName]
                return (
                    <li key={fieldName}>
                        <h4>{fieldName}</h4>
                        <div>
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

const XrayGrid = ({ xray, fields, distribution }) =>
    <div className="full">
        <ol>
            <li className="border-bottom border-dark">
                <ol className="Grid Grid--gutters">
                    <li className="Grid-cell">
                        <h3>Field</h3>
                    </li>
                    { fields.map(field =>
                        <li className="Grid-cell">
                            <h3>{field}</h3>
                        </li>
                    )}
                    { distribution && (
                        <li className="Grid-cell">
                            <h3>Distribution</h3>
                        </li>
                    )}
                </ol>
            </li>
            { Object.keys(xray).map(key => {
                const field = xray[key]
                return (
                    <li className="border-bottom">
                        <ol className="Grid Grid--gutters">
                            <li className="Grid-cell">
                                <a className="link text-bold">{key}</a>
                            </li>
                            { fields.map(f =>
                                <li className="Grid-cell">
                                    { field[f] }
                                </li>
                            )}
                            { /*
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
                            */}
                            { distribution && (
                                <li className="Grid-cell">
                                </li>
                            )}
                        </ol>
                    </li>
                )
            })}
        </ol>
    </div>

class CardXRay extends Component {
    props: Props

    state = {
        grid: true
    }

    componentDidMount () {
        this.props.fetchCardxray(this.props.params.cardId)
    }


    render () {
        const { xray } = this.props
        return (
            <div className="wrapper" style={{ marginLeft: '6em', marginRight: '6em'}}>
                <div className="my4 py4">
                    <h1>Xray</h1>
                </div>
                <LoadingAndErrorWrapper loading={!xray}>
                    { () =>
                        <div className="full">
                            { this.state.grid ?(
                                <div className="mt3">
                                    <div className="my4">
                                        <h2 className="py3 my3">Overview</h2>
                                        <XrayGrid
                                            xray={xray}
                                            fields={['count', 'min', 'max', 'mean', 'median']}
                                            distribution={false}
                                        />
                                    </div>
                                    <div className="my4">
                                        <h2 className="py3 my3">I am a cool math wizard</h2>
                                        <XrayGrid
                                            xray={xray}
                                            fields={['skewness', 'has-nils?', 'all-distinct?', 'range-vs-spread', 'sum-of-squares', 'range-vs-sd']}
                                            distribution={true}
                                        />
                                    </div>
                                    { xray['CREATED_AT'] && (
                                        <div className="my4">
                                            <h2 className="py3 my3">Time breakdown</h2>
                                            <div className="my3">
                                                <h4>Hour</h4>
                                            </div>
                                            <div className="my3">
                                                <h4>Day</h4>
                                            </div>
                                            <div className="my3">
                                                <h4>Month</h4>
                                            </div>
                                            <div className="my3">
                                                <h4>Quarter</h4>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                            : (
                                <XrayList xray={xray} />
                            )}
                            <pre>

                                <code>
                                    { JSON.stringify(xray, null, 2) }
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
    xray: state.xray.tablexray,
})

const mapDispatchToProps = {
    fetchCardxray: fetchCardXray
}

export default connect(mapStateToProps, mapDispatchToProps)(CardXRay)
