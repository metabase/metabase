import React, { Component, PropTypes } from "react";
import { findDOMNode } from "react-dom";
import { pluralize } from "humanize-plus";

import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";

const UNITS = ['Minute', 'Day', 'Week', 'Month', 'Year'];

export default class RelativeDatePicker extends Component {
    constructor(props) {
        super(props);
        const [, , value, unit] = props.filter;
        const { formatter } = props;

        this.state = {
            val: formatter(value) || 30,
            timeUnit: unit || "day"
        }
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        formatter: PropTypes.func.isRequired
    };

    componentDidMount () {
        // focus the value input immediately
        findDOMNode(this.refs.valueInput).focus();
    }

    setFilter () {
        const { filter, formatter, onFilterChange } = this.props;
        const { val, timeUnit } = this.state;
        onFilterChange(["TIME_INTERVAL", filter[1], val, timeUnit]);
    }

    setUnit (timeUnit) {
        this.setState({ timeUnit }, () => this.setFilter());
    }

    onValueChange (val) {
        val = this.props.formatter(val); // needs to be an integer
        this.setState({ val }, () => this.setFilter());
    }

    render() {
        const { timeUnit, val } = this.state;
        return (
            <div className="p2">
                <input
                    className="input"
                    defaultValue={val}
                    onChange={ ({ target: { value }}) => this.onValueChange(value) }
                    placeholder="30"
                    ref="valueInput"
                />
                <ExpandingContent open={true}>
                    <UnitPicker
                        val={val}
                        currentUnit={timeUnit}
                        setUnit={this.setUnit.bind(this)}
                    />
                </ExpandingContent>
            </div>
        );
    }
}

const UnitPicker =({ currentUnit, setUnit, val }) =>
   <div>
       <div>
           <h2>{pluralize(val, currentUnit)}</h2>
           <Icon name='chevrondown' />
        </div>
        <ol>
           { UNITS.map((unit, index) =>
               <li
                   key={index}
                   onClick={ () => setUnit(unit.toLowerCase()) }
               >
                   {pluralize(val, unit)}
               </li>
             )
           }
       </ol>
   </div>
