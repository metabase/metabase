import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import _ from "underscore";

import MetabaseAnalytics from 'metabase/lib/analytics';
import MetabaseUtils from "metabase/lib/utils";
import SettingsSetting from "./SettingsSetting.jsx";

export default class SettingsEmailForm extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            dirty: false,
            formData: {},
            sendingEmail: "default",
            submitting: "default",
            valid: false,
            validationErrors: {}
        }
    }

    static propTypes = {
        elements: PropTypes.array.isRequired,
        formErrors: PropTypes.object,
        sendTestEmail: PropTypes.func.isRequired,
        updateEmailSettings: PropTypes.func.isRequired
    };

    componentWillMount() {
        // this gives us an opportunity to load up our formData with any existing values for elements
        this.updateFormData(this.props);
    }

    componentWillReceiveProps(nextProps) {
        this.updateFormData(nextProps);
    }

    updateFormData(props) {
        let formData = {};
        for (const element of props.elements) {
            formData[element.key] = element.value;
        }
        this.setState({ formData });
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
            }
        }, this);

        if (this.state.valid !== valid || !_.isEqual(this.state.validationErrors, validationErrors)) {
            this.setState({ valid, validationErrors });
        }
    }

    handleChangeEvent(element, value, event) {
        this.setState({
            dirty: true,
            formData: { ...this.state.formData, [element.key]: (MetabaseUtils.isEmpty(value)) ? null : value }
        });
    }

    handleFormErrors(error) {
        // parse and format
        let formErrors = {};
        if (error.data && error.data.message) {
            formErrors.message = error.data.message;
        } else {
            formErrors.message = "Looks like we ran into some problems";
        }

        if (error.data && error.data.errors) {
            formErrors.elements = error.data.errors;
        }

        return formErrors;
    }

    sendTestEmail(e) {
        e.preventDefault();

        this.setState({
            formErrors: null,
            sendingEmail: "working"
        });

        this.props.sendTestEmail().then(() => {
            this.setState({sendingEmail: "success"});
            MetabaseAnalytics.trackEvent("Email Settings", "Test Email", "success");

            // show a confirmation for 3 seconds, then return to normal
            setTimeout(() => this.setState({sendingEmail: "default"}), 3000);
        }, (error) => {
            this.setState({
                sendingEmail: "default",
                formErrors: this.handleFormErrors(error)
            });
            MetabaseAnalytics.trackEvent("Email Settings", "Test Email", "error");
        });
    }

    updateEmailSettings(e) {
        e.preventDefault();

        this.setState({
            formErrors: null,
            submitting: "working"
        });

        let { formData, valid } = this.state;

        if (valid) {
            this.props.updateEmailSettings(formData).then(() => {
                this.setState({
                    dirty: false,
                    submitting: "success"
                });

                MetabaseAnalytics.trackEvent("Email Settings", "Update", "success");

                // show a confirmation for 3 seconds, then return to normal
                setTimeout(() => this.setState({submitting: "default"}), 3000);
            }, (error) => {
                this.setState({
                    submitting: "default",
                    formErrors: this.handleFormErrors(error)
                });

                MetabaseAnalytics.trackEvent("Email Settings", "Update", "error");
            });
        }
    }

    render() {
        let { elements } = this.props;
        let { dirty, formData, formErrors, sendingEmail, submitting, valid, validationErrors } = this.state;

        let settings = elements.map((element, index) => {
            // merge together data from a couple places to provide a complete view of the Element state
            let errorMessage = (formErrors && formErrors.elements) ? formErrors.elements[element.key] : validationErrors[element.key];
            let value = formData[element.key] == null ? element.defaultValue : formData[element.key];

            return (
                <SettingsSetting
                    key={element.key}
                    setting={{ ...element, value }}
                    updateSetting={this.handleChangeEvent.bind(this, element)}
                    errorMessage={errorMessage}
                />
            );
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
                        <button className={cx("Button mr2", {"Button--primary": !disabled}, {"Button--success-new": submitting === "success"})} disabled={disabled} onClick={this.updateEmailSettings.bind(this)}>
                            {saveButtonText}
                        </button>
                        { (valid && !dirty && submitting === "default") ?
                            <button className={cx("Button", {"Button--success-new": sendingEmail === "success"})} disabled={disabled} onClick={this.sendTestEmail.bind(this)}>
                                {emailButtonText}
                            </button>
                        : null }
                        { formErrors && formErrors.message ? <span className="pl2 text-error text-bold">{formErrors.message}</span> : null}
                    </li>
                </ul>
            </form>
        );
    }
}
