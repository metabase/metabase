import React, { Component, PropTypes } from "react";
import cx from "classnames";
import _ from "underscore";

import MetabaseUtils from "metabase/lib/utils";
import SettingsEmailFormElement from "./SettingsEmailFormElement.jsx";


export default class SettingsEmailForm extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            formData: {},
            valid: false,
            validationErrors: {}
        }
    }

    static propTypes = {
        elements: PropTypes.object,
        formErrors: PropTypes.object,
        submitFn: PropTypes.func.isRequired
    };

    // return null if element passes validation, otherwise return an error message
    validateElement([validationType, validationMessage], value, element) {
        if (MetabaseUtils.isEmpty(value)) return;

        switch (validationType) {
            case "email":
                return !MetabaseUtils.validEmail(value) ? (validationMessage || "That's not a valid email address") : null;
            case "integer":
                return isNaN(parseInt(value)) ? (validationMessage || "That's not a valid integer") : null;
        }
    }

    validateForm() {
        let { elements } = this.props;
        let { formData } = this.state;

        let valid = true,
            validationErrors = {};

        elements.forEach(function(element) {
            // test for required elements
            if (element.required && MetabaseUtils.isEmpty(formData[element.key])) {
                // TODO: allow the element to indicate if it wants to report failed requirements as validationErrors
                valid = false;
            }

            // TODO: other validations such as email, value type, length, etc
            if (element.validations) {
                element.validations.forEach(function(validation) {
                    validationErrors[element.key] = this.validateElement(validation, formData[element.key], element);
                    if (validationErrors[element.key]) valid = false;
                }, this);
            };
        }, this);

        if (this.state.valid !== valid || !_.isEqual(this.state.validationErrors, validationErrors)) {
            this.setState({ valid, validationErrors });
        }
    }

    componentWillMount() {
        // this gives us an opportunity to load up our formData with any existing values for elements
        let formData = {};
        this.props.elements.forEach(function(element) {
            formData[element.key] = element.value;
        });

        this.setState({formData});
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    handleChangeEvent(element, value, event) {
        // TODO: we can handle some value typing here if defined in the element
        this.setState({ formData: { ...this.state.formData, [element.key]: value }});
    }

    formSubmitted(e) {
        e.preventDefault();

        let { submitFn } = this.props;
        let { formData, valid } = this.state;

        if (valid) {
            submitFn(formData);
        }
    }

    // TODO: make the render function configurable
    render() {
        let { elements, formErrors } = this.props;
        let { formData, valid, validationErrors } = this.state;
        console.log('formErrors=', formErrors);
        console.log('formData=', formData);
        console.log('validationErrors=', validationErrors);

        let settings = elements.map((element, index) => {
            // merge together data from a couple places to provide a complete view of the Element state
            let errorMessage = (formErrors && formErrors.elements) ? formErrors.elements[element.key] : validationErrors[element.key],
                value = formData[element.key] || element.defaultValue;

            return <SettingsEmailFormElement
                        key={element.key}
                        element={_.extend(element, {value, errorMessage })}
                        handleChangeEvent={this.handleChangeEvent.bind(this)} />
        });

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <ul>
                    {settings}
                    <li className="m2 mb4">
                        <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                            Save changes
                        </button>
                        { formErrors && formErrors.message ? <span>{formErrors.message}</span> : null}
                    </li>
                </ul>
            </form>
        );
    }
}
