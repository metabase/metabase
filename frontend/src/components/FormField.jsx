import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class FormField extends Component {
    static propTypes = {
        fieldName: PropTypes.string.isRequired,
        displayName: PropTypes.string.isRequired,
        showCharm: PropTypes.bool,
        errors: PropTypes.object
    };

    extractFieldError() {
        if (this.props.errors &&
            this.props.errors.data.errors &&
            this.props.fieldName in this.props.errors.data.errors) {
            return this.props.errors.data.errors[this.props.fieldName];
        } else {
            return null;
        }
    }

    render() {
        var fieldError = this.extractFieldError();

        var fieldClasses = cx({
            "Form-field": true,
            "Form--fieldError": (fieldError !== null)
        });

        var fieldErrorMessage;
        if (fieldError !== null) {
            fieldErrorMessage = (
                <span className="text-error mx1">{fieldError}</span>
            );
        }

        var fieldLabel = (
            <label className="Form-label">{this.props.displayName} {fieldErrorMessage}</label>
        );

        var formCharm;
        if (this.props.showCharm) {
            formCharm = (
                <span className="Form-charm"></span>
            );
        }

        return (
            <div className={fieldClasses}>
                {fieldLabel}
                {this.props.children}
                {formCharm}
            </div>
        );
    }
}
