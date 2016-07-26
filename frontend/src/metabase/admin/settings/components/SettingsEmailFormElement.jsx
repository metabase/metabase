import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";
import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";

import _ from "underscore";
import cx from "classnames";


export default class SettingsEmailFormElement extends Component {
    static propTypes = {
        element: PropTypes.object.isRequired,
        handleChangeEvent: PropTypes.func.isRequired,
        autoFocus: PropTypes.bool
    };

    handleInputEvent(element, event) {
        this.props.handleChangeEvent(element, event.target.value, event);
    }

    renderTextInput(element, type="text") {
        let className = "SettingsInput";

        if (element.errorMessage) {
            className = className + " border-error bg-error-input";
        }

        return (
            <Input
                className={className + " AdminInput bordered rounded h3"}
                type={type}
                value={element.value}
                placeholder={element.placeholder}
                onChange={element.fireOnChange ? this.handleInputEvent.bind(this, element) : null }
                onBlurChange={!element.fireOnChange ? this.handleInputEvent.bind(this, element) : null }
                autoFocus={element.autoFocus}
            />
        );
    }

    renderRadioInput(element) {
        const options = _.map(element.options, (name, value) => {
            var classes = cx("h3", "text-bold", "text-brand-hover", "no-decoration",  { "text-brand": element.value === value });
            return (
                <li className="mr3" key={value}>
                    <a className={classes} href="#" onClick={this.props.handleChangeEvent.bind(null, element, value)}>{name}</a>
                </li>
            );
        });
        return <ul className="flex text-grey-4">{options}</ul>
    }

    renderSelectInput(element) {
        return (
            <Select
                className="full-width"
                placeholder={element.placeholder}
                value={element.value}
                options={element.options}
                onChange={this.handleInputEvent.bind(this, element)}
                optionNameFn={option => typeof option === "object" ? option.name : option }
                optionValueFn={option => typeof option === "object" ? option.value : option }
            />
        );
    }

    renderToggleInput(element) {
        const on = (element.value == null ? element.default : element.value) === true;
        return (
            <div className="flex align-center pt1">
                <Toggle value={on} onChange={this.props.handleChangeEvent.bind(null, element, on ? "false" : "true")}/>
                <span className="text-bold mx1">{on ? "Enabled" : "Disabled"}</span>
            </div>
        );
    }

    render() {
        const element = this.props.element;

        let control;
        switch (element.type) {
            case "string":   control = this.renderTextInput(element); break;
            case "password": control = this.renderTextInput(element, "password"); break;
            case "select":   control = this.renderSelectInput(element); break;
            case "radio":    control = this.renderRadioInput(element); break;
            case "boolean":  control = this.renderToggleInput(element); break;
            default:
                console.warn("No render method for element type " + element.type + ", defaulting to text input.");
                control = this.renderTextInput(element);
        }

        return (
            <li className="m2 mb4">
                <div className="text-grey-4 text-bold text-uppercase pb1">{element.display_name}</div>
                { element.description ? <div className="text-grey-4 pb1">{element.description}</div> : null }
                <div className="flex">{control}</div>
                { element.errorMessage ? <div className="text-error text-bold pt1">{element.errorMessage}</div> : null }
            </li>
        );
    }
}
