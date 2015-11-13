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
            sendingEmail: "default",
            submitting: "default",
            valid: false,
            validationErrors: {}
        }
    }

    static propTypes = {
        elements: PropTypes.object,
        formErrors: PropTypes.object,
        submitFn: PropTypes.func.isRequired,
        testEmailFn: PropTypes.func.isRequired
    };

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

    setSubmitting(submitting) {
        this.setState({submitting});
    }

    setSendingEmail(sendingEmail) {
        this.setState({sendingEmail});
    }

    setFormErrors(formErrors) {
        this.setState({formErrors});
    }

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
                valid = false;
            }

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

    handleChangeEvent(element, value, event) {
        this.setState({ formData: { ...this.state.formData, [element.key]: (MetabaseUtils.isEmpty(value)) ? null : value }});
    }

    sendTestEmail(e) {
        e.preventDefault();

        let { testEmailFn } = this.props;
        let { formData, valid } = this.state;

        if (valid) {
            testEmailFn(formData);
        }
    }

    formSubmitted(e) {
        e.preventDefault();

        let { submitFn } = this.props;
        let { formData, valid } = this.state;

        if (valid) {
            submitFn(formData);
        }
    }

    render() {
        let { elements } = this.props;
        let { formData, formErrors, sendingEmail, submitting, valid, validationErrors } = this.state;

        let settings = elements.map((element, index) => {
            // merge together data from a couple places to provide a complete view of the Element state
            let errorMessage = (formErrors && formErrors.elements) ? formErrors.elements[element.key] : validationErrors[element.key],
                value = formData[element.key] || element.defaultValue;

            return <SettingsEmailFormElement
                        key={element.key}
                        element={_.extend(element, {value, errorMessage })}
                        handleChangeEvent={this.handleChangeEvent.bind(this)} />
        });

        let sendTestButtonStates = {
            default: "Send test email",
            working: "Sending...",
            success: "Sent!"
        };

        let saveSettingsButtonStates = {
            default: "Save changes",
            working: "Saving...",
            success: "Changes saved!"
        };

        let disabled = (!valid || submitting !== "default" || sendingEmail !== "default"),
            emailButtonText = sendTestButtonStates[sendingEmail],
            saveButtonText = saveSettingsButtonStates[submitting];

        return (
            <form noValidate>
                <ul>
                    {settings}
                    <li className="m2 mb4">
                        <button className={cx("Button mr2", {"Button--success-new": sendingEmail === "success"})} disabled={disabled} onClick={this.sendTestEmail.bind(this)}>
                            {emailButtonText}
                        </button>
                        <button className={cx("Button", {"Button--primary": !disabled}, {"Button--success-new": submitting === "success"})} disabled={disabled} onClick={this.formSubmitted.bind(this)}>
                            {saveButtonText}
                        </button>
                        { formErrors && formErrors.message ? <span className="pl2 text-error text-bold">{formErrors.message}</span> : null}
                    </li>
                </ul>
            </form>
        );
    }
}
