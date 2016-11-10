import React, { Component, PropTypes } from "react";
import { pluralize } from "humanize-plus";

import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";

import NumericInput from "./NumericInput.jsx";

export default class RelativeDatePicker extends Component {
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
            <div className="p2">
                <NumericInput
                    className="input"
                    value={typeof intervals === "number" ? Math.abs(intervals) : intervals}
                    onChange={(value) =>
                        onFilterChange([op, field, formatter(value), unit])
                    }
                    placeholder="30"
                />
                <ExpandingContent open={true}>
                    <UnitPicker
                        value={unit}
                        onChange={(value) => onFilterChange([op, field, intervals, value])}
                        intervals={intervals}
                    />
                </ExpandingContent>
            </div>
        );
    }
}

export const UnitPicker = ({ value, onChange, intervals }) =>
   <div>
       <div className="flex align-center">
           <h2>{pluralize(intervals || 1, value)}</h2>
           <Icon name='chevrondown' />
        </div>
        <ol>
           { ['Minute', 'Hour', 'Day', 'Month', 'Year',].map((unit, index) =>
               <li
                   key={index}
                   onClick={ () => onChange(unit.toLowerCase()) }
               >
                   {pluralize(intervals || 1, unit)}
               </li>
             )
           }
       </ol>
   </div>
