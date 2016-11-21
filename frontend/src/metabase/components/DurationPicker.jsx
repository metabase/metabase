import React, {Component, PropTypes} from "react";

export default class DurationPicker extends Component {

    static propTypes = {
        valueInSeconds: PropTypes.number,
        name: PropTypes.string,
        inputClass: PropTypes.string,
        selectClass: PropTypes.string,
        onChange: PropTypes.func
    };

    // IMPORTANT: keep this sort order. The fromSeconds depends of it
    static timeUnitToSecondsConstants = {
        days: 86400,
        hours: 3600,
        minutes: 60,
        seconds: 1
    };

    static toSeconds(timeUnit, value) {
        return value * DurationPicker.timeUnitToSecondsConstants[timeUnit];
    }

    static fromSeconds(valueInSeconds){
        let entries = Object.entries(DurationPicker.timeUnitToSecondsConstants);

        // finds the first element that divides valueInSeconds
        let [timeUnit, timeUnitMultiplier] = entries.find(([_, value]) => valueInSeconds % value === 0);

        return {timeUnit: timeUnit, value: valueInSeconds / timeUnitMultiplier};
    }

    constructor(props, context) {
        super(props, context);

        this.state = DurationPicker.fromSeconds(props.valueInSeconds || 1);
    }

    onChangeValue(e) {
        this.notifyUpdate({value: e.target.value, timeUnit: this.state.timeUnit});
    }

    onChangeTimeUnit(e) {
        this.notifyUpdate({value: this.state.value, timeUnit: e.target.value});
    }


    notifyUpdate(state) {

        this.setState(state);

        const {value, timeUnit} = state;

        let valueInSeconds = DurationPicker.toSeconds(timeUnit, value);

        if (this.props.onChange) {
            // TODO: use a proper event object?
            this.props.onChange({
                ...state,
                valueInSeconds: valueInSeconds,
            });
        }
    }

    render() {
        const {name, inputClass, inputStyle = {}, selectClass, selectStyle = {}} = this.props;

        const {value, timeUnit} = this.state;

        return (
            <div>
                <input type="number"
                       name={name}
                       value={value}
                       className={inputClass}
                       style={inputStyle}
                       onChange={(e) => this.onChangeValue(e)}/>

                <select value={timeUnit}
                    className={selectClass}
                    style={selectStyle}
                    onChange={(e) => this.onChangeTimeUnit(e)}>
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                </select>
            </div>
        )
    }
}
