import React, {Component, PropTypes} from "react";

export default class DurationPicker extends Component {

    static propTypes = {
        value: PropTypes.int,
        timeUnit: PropTypes.timeUnit,
        name: PropTypes.string,
        inputClass: PropTypes.string,
        selectClass: PropTypes.string,
        onChange: PropTypes.func
    };

    onChangeValue(e) {
        this.notifyUpdate({value: e.target.value, timeUnit: this.props.timeUnit});
    }

    onChangeTimeUnit(e) {
        this.notifyUpdate({value: this.props.value, timeUnit: e.target.value});
    }

    notifyUpdate(state) {

        const {value, timeUnit} = state;

        let valueInSeconds = 0;

        switch (timeUnit) {
            case "seconds":
                valueInSeconds = value;
                break;
            case "minutes":
                valueInSeconds = value * 60;
                break;
            case "hours":
                valueInSeconds = value * 3600;
                break;
            case "days":
                valueInSeconds = value * 86400;
                break;
        }

        if (this.props.onChange) {
            // TODO: use a proper event object?
            this.props.onChange({
                valueInSeconds: valueInSeconds,
                value: value,
                timeUnit: timeUnit
            });
        }
    }

    render() {
        const {value, timeUnit, name, inputClass, selectClass} = this.props;
        return (
            <div>
                <input type="number" className={inputClass} name={name} value={value}
                       onChange={(e) => this.onChangeValue(e)}/>

                <select className={selectClass} value={timeUnit} onChange={(e) => this.onChangeTimeUnit(e)}>
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                </select>
            </div>
        )
    }
}
