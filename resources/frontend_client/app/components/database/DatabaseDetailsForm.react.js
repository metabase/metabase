"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";

import MetabaseCore from "metabase/lib/core";
import FormField from "metabase/components/form/FormField.react";
import FormLabel from "metabase/components/form/FormLabel.react";
import FormMessage from "metabase/components/form/FormMessage.react";


export default class DatabaseDetailsForm extends Component {

    formSubmitted(e) {
        e.preventDefault();

        let { engine, submitFn } = this.props;

        // collect data && validate
        let response = {
            'name': React.findDOMNode(this.refs.name).value
        };
        for (var fieldIdx in MetabaseCore.ENGINES[engine].fields) {
            let field = MetabaseCore.ENGINES[engine].fields[fieldIdx],
                ref = React.findDOMNode(this.refs[field.fieldName]);
            if (ref) {
                response[field.fieldName] = ref.value;
            }
        }

        // do callback
        submitFn(response);
    }

    renderFieldInput(field) {
        switch(field.type) {
            case 'select':
                return (
                    <div className="Form-input Form-offset full Button-group">
                        {field.choices.map(choice =>
                            <button className="Button"
                                    ng-className="details[field.fieldName] === choice.value ? {active: 'Button--active',
                                              danger: 'Button--danger'}[choice.selectionAccent] : null"
                                    ng-click="details[field.fieldName] = choice.value">
                                {choice.name}
                            </button>
                        )}
                    </div>
                );

            case 'password':
                return (
                    <input type="password" className="Form-input Form-offset full" ref={field.fieldName} name={field.fieldName} placeholder={field.placeholder} />
               );

            case 'text':
                return (
                    <input className="Form-input Form-offset full" ref={field.fieldName} name={field.fieldName} placeholder={field.placeholder} />
               );
        }
    }

    render() {
        let { engine, hiddenFields, submitButtonText } = this.props;
        hiddenFields = hiddenFields || [];

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <FormField fieldName="name">
                    <FormLabel title="Name" fieldName="name"></FormLabel>
                    <input className="Form-input Form-offset full" ref="name" name="name" placeholder="How would you like to refer to this database?" required autofocus />
                    <span className="Form-charm"></span>
                </FormField>

                <div className="FormInputGroup">
                    { MetabaseCore.ENGINES[engine].fields.filter(field => !_.contains(hiddenFields, field.fieldName)).map(field =>
                        <FormField fieldName={field.fieldName}>
                            <FormLabel title={field.displayName} fieldName={field.fieldName}></FormLabel>

                            {this.renderFieldInput(field)}

                            <span className="Form-charm"></span>
                        </FormField>
                    )}
                </div>

                <div className="Form-actions">
                    <button className="Button" mb-action-button="saveNoRedirect" success-text="Saved!" failed-text="Failed!" active-text="Validating " ng-disabled="!form.$valid || !database.engine">
                        {submitButtonText}
                    </button>
                    <FormMessage></FormMessage>
                </div>
            </form>
        );
    }
}

DatabaseDetailsForm.propTypes = {
    dispatch: PropTypes.func.isRequired,
    engine: PropTypes.string.isRequired,
    submitButtonText: PropTypes.string.isRequired,
    submitFn: PropTypes.func.isRequired
}
