import React, { Component } from "react"
import { connect } from "react-redux";

import {
    isDate
} from "metabase/lib/schema_metadata"

import {
    selectAndAdvance,
    setPivotBreakouts,
} from '../actions'

import {
    getBreakoutsForFlow,
} from '../selectors'

const mapStateToProps = state => ({
    fields: getBreakoutsForFlow(state)
})

const mapDispatchToProps = ({
    selectAndAdvance,
    setPivotBreakouts,
})

@connect(mapStateToProps, mapDispatchToProps)
class PivotSelection extends Component {
    constructor() {
        super()
        this.state = {
            breakouts: []
        }
    }

    selectBreakout = (breakout) => {
        console.log('breakout', breakout)
        return this.setState({ breakouts: this.state.breakouts.concat([breakout]) })
    }

    completeStep = () => {
        const { setPivotBreakouts, selectAndAdvance } = this.props
        const formattedBreakouts = this.state.breakouts.map(field => {
            let x
            console.log(field)
            if(isDate(field)) {
                x =["datetime-field", ["field-id", field.id], "as", "day"]
            } else {
                x = ["field-id", field.id]
            }
            return x
        })
        return selectAndAdvance(() => setPivotBreakouts(formattedBreakouts))

    }
    render () {
        const { fields } = this.props
        return (
            <div>
                <div className="flex align-center">
                    Pivot by:
                    { this.state.breakouts.map(breakout => <div>{breakout.display_name}</div>) }
                    <button className="ml-auto Button Button--primary" onClick={() => this.completeStep()}>Next</button>
                </div>

                <div className="border-top">
                { fields.map(field =>
                    <div onClick={() => this.selectBreakout(field) }>
                        {field.display_name}
                    </div>
                )}
                </div>
            </div>
        )
    }
}

export default PivotSelection;
