import React, { Component, PropTypes } from "react";
import { findDOMNode } from "react-dom";

import Icon from "metabase/components/Icon";

export default class RelativeDatePicker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            val: 30,
            type: -1,
            timeUnit: "day"
        }
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired
    };

    componentDidMount () {
        // focus the value input immediately
        findDOMNode(this.refs.valueInput).focus();
    }

    setFilter () {
        let { filter } = this.props;
        const { val, timeUnit } = this.state;
        this.props.onFilterChange(["TIME_INTERVAL", filter[1], val, timeUnit]);
    }

    setUnit (timeUnit) {
        this.setState({ timeUnit });
        this.setFilter();
    }

    formatForPastOrFuture (val) {
    }

    onValueChange (val) {
        val = Number(val); // needs to be an integer
        this.setState({ val });
        this.setFilter();
    }

    render() {
        const { timeUnit, val } = this.state;
        return (
            <div className="p2">
                <div>Last</div>
                <input
                    defaultValue={val}
                    onChange={ (ev) => this.onValueChange(ev.target.value) }
                    placeholder="30"
                    ref="valueInput"
                />
                <UnitPicker
                    currentUnit={timeUnit}
                    setUnit={this.setUnit.bind(this)}
                />
            </div>
        );
    }
}

const UNITS = ['Minute', 'Day', 'Week', 'Month', 'Year'];


class UnitPicker extends Component {
    constructor () {
        super();
    }
    render () {
        const { currentUnit, open, setUnit } = this.props;
        return (
           <div>
               <div>
                </div>
               <h2>{currentUnit}</h2>
               {
                   UNITS.map((u, i) =>
                       <li key={i} onClick={ () => setUnit(u.toLowerCase()) }>
                           {u}
                       </li>
                   )
               }
           </div>
        );
    }
};

