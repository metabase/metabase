import React, { Component, PropTypes } from "react";
import cx from "classnames";

import MetabaseCore from "metabase/lib/core";
import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";


// TODO - this should be somewhere more centralized
function isEmpty(str) {
    return (!str || 0 === str.length);
}

/**
 * This is a form for capturing database details for a given `engine` supplied via props.
 * The intention is to encapsulate the entire <form> with standard MB form styling and allow a callback
 * function to receive the captured form input when the form is submitted.
 */
export default class DatabaseDetailsForm extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            details: props.details || {},
            valid: false
        }
    }

    static propTypes = {
        details: PropTypes.object,
        engine: PropTypes.string.isRequired,
        formError: PropTypes.object,
        hiddenFields: PropTypes.array,
        submitButtonText: PropTypes.string.isRequired,
        submitFn: PropTypes.func.isRequired
    };

    validateForm() {
        let { engine } = this.props;
        let { details } = this.state;

        let valid = true;

        // name is required
        if (!details.name) {
            valid = false;
        }

        // go over individual fields
        for (let field of MetabaseCore.ENGINES[engine].fields) {
            if (field.required && isEmpty(details[field.fieldName])) {
                valid = false;
                break;
            }
        }

        if (this.state.valid !== valid) {
            this.setState({ valid });
        }
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    onChange(fieldName, fieldValue) {
        this.setState({ details: { ...this.state.details, [fieldName]: fieldValue }});
    }

    formSubmitted(e) {
        e.preventDefault();

        let { engine, submitFn } = this.props;
        let { details } = this.state;

        let request = {
            engine: engine,
            name: details.name,
            details: {}
        };

        for (let field of MetabaseCore.ENGINES[engine].fields) {
            let val = details[field.fieldName] === "" ? null : details[field.fieldName];
            if (val == null && field.placeholderIsDefault) {
                val = field.placeholder;
            }
            if (field.transform) {
                val = field.transform(val);
            }
            request.details[field.fieldName] = val;
        }

        submitFn(request);
    }

    renderFieldInput(field, fieldIndex) {
        let { details } = this.state;
        let value = details && details[field.fieldName] || "";

        switch(field.type) {
            case 'select':
                return (
                    <div className="Form-input Form-offset full Button-group">
                        {field.choices.map(choice =>
                            <div
                                className={cx("Button", details[field.fieldName] == choice.value ? "Button--" + choice.selectionAccent : null)}
                                onClick={(e) => { this.onChange(field.fieldName, choice.value)}}
                            >
                                {choice.name}
                            </div>
                        )}
                    </div>
                );
            case 'text':
            case 'password':
                return (
                    <input
                        type={field.type}
                        className="Form-input Form-offset full"
                        ref={field.fieldName}
                        name={field.fieldName}
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => this.onChange(field.fieldName, e.target.value)}
                        required={field.required}
                        autoFocus={fieldIndex === 0}
                    />
               );
        }
    }

    render() {
        let { details, engine, formError, formSuccess, hiddenFields, submitButtonText } = this.props;
        let { valid } = this.state;

        let fields = [
            {
                displayName: "Name",
                fieldName: "name",
                type: "text",
                placeholder: "How would you like to refer to this database?",
                placeholderIsDefault: false,
                required: true
            },
            ...MetabaseCore.ENGINES[engine].fields
        ];

        hiddenFields = hiddenFields || {};

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <div className="FormInputGroup">
                    { fields.filter(field => !hiddenFields[field.fieldName]).map((field, fieldIndex) =>
                        <FormField fieldName={field.fieldName}>
                            <FormLabel title={field.displayName} fieldName={field.fieldName}></FormLabel>
                            {this.renderFieldInput(field, fieldIndex)}
                            <span className="Form-charm"></span>
                        </FormField>
                    )}
                </div>

                <div className="Form-actions">
                    <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                        {submitButtonText}
                    </button>
                    <FormMessage formError={formError} formSuccess={formSuccess}></FormMessage>
                </div>
            </form>
        );
    }
}
