import React, { Component } from "react"
import { connect } from "react-redux";

import {
    getBreakoutsForFlow,
} from '../selectors'

const mapStateToProps = state => ({
    fields: getBreakoutsForFlow(state)
})

@connect(mapStateToProps)
class PivotSelection extends Component {
    constructor() {
        super()
        this.state = {
            breakouts: []
        }
    }

    selectBreakout = (breakout) => {
        this.setState({ breakouts: this.state.breakouts.concat([]) })
    }
    render () {
        const { fields } = this.props
        return (
            <div>
                Pivot!
                { fields.map(field => field) }
            </div>
        )
    }
}

export default PivotSelection;
