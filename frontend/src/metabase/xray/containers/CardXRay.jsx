import React, { Component } from 'react'
import cxs from 'cxs'
import { connect } from 'react-redux'
import { Link } from 'react-router'

import { saturated } from 'metabase/lib/colors'

import { fetchCardXray } from 'metabase/xray/xray'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import Visualization from 'metabase/visualizations/components/Visualization'

import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'

type Props = {
    fetchCardXray: () => void,
    xray: {}
}

const GrowthRateDisplay = ({ period }) =>
    <div className="Grid-cell">
        <div className="p4 border-right">
            <h4>{period.label}</h4>
            <h1
                className={cxs({
                    color: period.value > 0 ? saturated.green : saturated.red
                })}
            >
                {period.value && (period.value).toFixed(2)}%
            </h1>
        </div>
    </div>

class CardXRay extends Component {
    props: Props

    componentDidMount () {
        const { cardId, cost } = this.props.params
        this.props.fetchCardxray(cardId, cost)
    }


    render () {
        const { xray } = this.props
        return (
            <LoadingAndErrorWrapper loading={!xray}>
                { () =>
                    <XRayPageWrapper>
                        <div className="my2">
                            <h1>{xray.features.card.name} XRay</h1>
                            <Link to={`/xray/table/${xray.features.table.id}/approximate`}>
                                Xray {xray.features.table.display_name}
                            </Link>
                        </div>
                        <div>
                            <div className="full my2">
                                <div className="bg-white bordered rounded shadowed" style={{ height: 400}}>
                                    <Visualization
                                        series={[
                                            {
                                                card: xray.features.card,
                                                data: xray.dataset
                                            },
                                        ]}
                                        className="full-height"
                                    />
                                </div>
                            </div>

                            <Heading heading="Growth rate" />
                            <div className="Grid Grid--1of4 bg-white bordered rounded shadowed">
                                { xray.features.DoD && (
                                    <GrowthRateDisplay period={xray.features.DoD} />
                                )}
                                { xray.features.WoW && (
                                    <GrowthRateDisplay period={xray.features.WoW} />
                                )}
                                { xray.features.MoM && (
                                    <GrowthRateDisplay period={xray.features.MoM} />
                                )}
                                { xray.features.YoY && (
                                    <GrowthRateDisplay period={xray.features.YoY} />
                                )}
                            </div>
                        </div>
                    </XRayPageWrapper>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

const mapStateToProps = state => ({
    xray: state.xray.cardXray,
})

const mapDispatchToProps = {
    fetchCardxray: fetchCardXray
}

export default connect(mapStateToProps, mapDispatchToProps)(CardXRay)
