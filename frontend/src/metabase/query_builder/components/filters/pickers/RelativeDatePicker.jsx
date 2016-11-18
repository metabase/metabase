import React, { Component, PropTypes } from "react";
import { pluralize, titleCase } from "humanize-plus";

import Icon from "metabase/components/Icon";
import NumericInput from "./NumericInput.jsx";

export default class RelativeDatePicker extends Component {
    constructor () {
        super();
        this.state = { showUnits: false };
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        formatter: PropTypes.func.isRequired
    };

    static defaultProps = {
        formatter: (value) => value
    }

    render() {
        const { filter: [op, field, intervals, unit], onFilterChange, formatter } = this.props;
        return (
            <div className="px2">
                <NumericInput
                    className="input h3 mb2"
                    value={typeof intervals === "number" ? Math.abs(intervals) : intervals}
                    onChange={(value) =>
                        onFilterChange([op, field, formatter(value), unit])
                    }
                    placeholder="30"
                />
                <UnitPicker
                    open={this.state.showUnits}
                    value={unit}
                    onChange={(value) => {
                        onFilterChange([op, field, intervals, value]);
                        this.setState({ showUnits: false });
                    }}
                    togglePicker={() => this.setState({ showUnits: !this.state.showUnits})}
                    intervals={intervals}
                />
            </div>
        );
    }
}

export const UnitPicker = ({ open, value, onChange, togglePicker, intervals }) =>
   <div>
       <div
           onClick={() => togglePicker()}
           className="flex align-center cursor-pointer text-purple-hover mb2"
       >
           <h3>{pluralize(intervals || 1, titleCase(value))}</h3>
           <Icon name='chevrondown' />
        </div>
        <ol style={{
            maxHeight: open ? 'none': 0,
            overflow: 'hidden'
        }}>
           { ['Minute', 'Hour', 'Day', 'Month', 'Year',].map((unit, index) =>
               <li
                   className="cursor-pointer mb1 text-bold text-purple-hover"
                   key={index}
                   onClick={ () => onChange(unit.toLowerCase()) }
               >
                   {pluralize(intervals || 1, unit)}
               </li>
             )
           }
       </ol>
   </div>
