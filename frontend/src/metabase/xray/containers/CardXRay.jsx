import React, { Component } from 'react'

import { connect } from 'react-redux'
import { fetchCardXray } from 'metabase/xray/xray'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import Visualization from 'metabase/visualizations/components/Visualization'

type Props = {
    fetchCardXray: () => void,
    xray: {}
}

const GrowthRateDisplay = ({ period }) =>
    <div>
        <h4>{period.label}</h4>
        <h1>{period.value}</h1>
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
                    <div>
                        <h1>Xray</h1>
                        { /*
                        <Visualization
                            series={xray.features.card}
                        />
                        */}

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
