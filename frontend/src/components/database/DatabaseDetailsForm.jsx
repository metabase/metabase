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
        this.state = { valid: false }
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
        let { valid } = this.state;

        let isValid = true;

        // name is required
        if (isEmpty(React.findDOMNode(this.refs.name).value)) isValid = false;

        // go over individual fields
        for (var fieldIdx in MetabaseCore.ENGINES[engine].fields) {
            let field = MetabaseCore.ENGINES[engine].fields[fieldIdx],
                ref = React.findDOMNode(this.refs[field.fieldName]);
            if (ref && field.required && isEmpty(ref.value)) {
                isValid = false;
            }
        }

        if(isValid !== valid) {
            this.setState({
                'valid': isValid
            });
        }
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    onChange(fieldName) {
        this.validateForm();
    }

    formSubmitted(e) {
        e.preventDefault();

        let { engine, submitFn } = this.props;

        // collect data
        let response = {
            'name': React.findDOMNode(this.refs.name).value,
            'engine': engine,
            'details': {}
        };

        for (var fieldIdx in MetabaseCore.ENGINES[engine].fields) {
            let field = MetabaseCore.ENGINES[engine].fields[fieldIdx],
                ref = React.findDOMNode(this.refs[field.fieldName]);
            if (ref) {
                let val = (ref.value && ref.value !== "") ? ref.value : null;
                if (val === null && field.placeholderIsDefault) {
                    val = field.placeholder;
                }

                if (field.transform) {
                    val = field.transform(val);
                }

                response.details[field.fieldName] = val;
            }
        }

        // do callback
        submitFn(response);
    }

    renderFieldInput(field) {
        let { details } = this.props;

        let defaultValue = (details && field.fieldName in details) ? details[field.fieldName] : "";

        switch(field.type) {
            case 'select':
                return (
                    <div className="Form-input Form-offset full Button-group">
                        {field.choices.map(choice =>
                            <div className={cx("Button", details[field.fieldName] == choice.value ? "Button--" + choice.selectionAccent : null)}
                                    onClick={(e) => { details[field.fieldName] = choice.value; this.onChange(field.fieldName, e)}}>
                                {choice.name}
                            </div>
                        )}
                    </div>
                );

            case 'password':
                return (
                    <input type="password" className="Form-input Form-offset full" ref={field.fieldName} name={field.fieldName} defaultValue={defaultValue} placeholder={field.placeholder} onChange={this.onChange.bind(this, field.fieldName)} />
               );

            case 'text':
                return (
                    <input className="Form-input Form-offset full" ref={field.fieldName} name={field.fieldName} defaultValue={defaultValue} placeholder={field.placeholder} onChange={this.onChange.bind(this, field.fieldName)} />
               );
        }
    }

    render() {
        let { details, engine, formError, hiddenFields, submitButtonText } = this.props;
        let { valid } = this.state;

        hiddenFields = hiddenFields || {};
        let existingName = (details && 'name' in details) ? details.name : "";

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <FormField fieldName="name">
                    <FormLabel title="Name" fieldName="name"></FormLabel>
                    <input className="Form-input Form-offset full" ref="name" name="name" defaultValue={existingName} placeholder="How would you like to refer to this database?" required autofocus  onChange={this.onChange.bind(this, "name")}  />
                    <span className="Form-charm"></span>
                </FormField>

                <div className="FormInputGroup">
                    { MetabaseCore.ENGINES[engine].fields.filter(field => !hiddenFields[field.fieldName]).map(field =>
                        <FormField fieldName={field.fieldName}>
                            <FormLabel title={field.displayName} fieldName={field.fieldName}></FormLabel>

                            {this.renderFieldInput(field)}

                            <span className="Form-charm"></span>
                        </FormField>
                    )}
                </div>

                <div className="Form-actions">
                    <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                        {submitButtonText}
                    </button>
                    <FormMessage formError={formError}></FormMessage>
                </div>
            </form>
        );
    }
}
