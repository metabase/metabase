"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import FormField from "metabase/components/form/FormField.react";
import FormLabel from "metabase/components/form/FormLabel.react";
import FormMessage from "metabase/components/form/FormMessage.react";
import Icon from "metabase/components/Icon.react";
import MetabaseUtils from "metabase/lib/utils";

import CollapsedStep from "./CollapsedStep.react";
import { setUserDetails } from "../actions";


export default class UserStep extends Component {

    constructor(props) {
        super(props);
        this.state = { valid: false, formError: null }
    }

    validateForm() {
        let { valid } = this.state;
        let isValid = true;

        // required: first_name, last_name, email, password
        for (var fieldName in this.refs) {
            let node = React.findDOMNode(this.refs[fieldName]);
            if (node.required && MetabaseUtils.isEmpty(node.value)) isValid = false;
        };

        if(isValid !== valid) {
            this.setState({
                'valid': isValid
            });
        }
    }

    onChange() {
        this.validateForm();
    }

    formSubmitted(e) {
        e.preventDefault();

        this.setState({
            formError: null
        });

        let formErrors = {data:{errors:{}}};

        // validate email address
        if (!MetabaseUtils.validEmail(React.findDOMNode(this.refs.email).value)) {
            formErrors.data.errors.email = "Not a valid formatted email address";
        }

        // TODO - validate password complexity

        // validate password match
        if (React.findDOMNode(this.refs.password).value !== React.findDOMNode(this.refs.passwordConfirm).value) {
            formErrors.data.errors.password_confirm = "Passwords do not match";
        }

        if (_.keys(formErrors.data.errors).length > 0) {
            this.setState({
                formError: formErrors
            });
            return;
        }

        this.props.dispatch(setUserDetails({
            'nextStep': ++this.props.stepNumber,
            'details': {
                'first_name': React.findDOMNode(this.refs.firstName).value,
                'last_name': React.findDOMNode(this.refs.lastName).value,
                'email': React.findDOMNode(this.refs.email).value,
                'password': React.findDOMNode(this.refs.password).value,
                'site_name': React.findDOMNode(this.refs.siteName).value
            }
        }));
    }

    render() {
        let { activeStep, dispatch, stepNumber, userDetails } = this.props;
        let { formError, valid } = this.state;

        const stepText = (activeStep <= stepNumber) ? 'What should we call you?' : 'Hi, ' + userDetails.first_name + '. nice to meet you!';

        if (activeStep !== stepNumber) {
            return (<CollapsedStep dispatch={dispatch} stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep SetupStep--active rounded full relative">
                    <div className="flex align-center py3">
                        <span className="SetupStep-indicator flex layout-centered absolute bordered">
                            <span className="SetupStep-number">{stepNumber}</span>
                            <Icon name={'check'} className="SetupStep-check" width={16} height={16}></Icon>
                        </span>
                        <h3 className="SetupStep-title ml4 my1">{stepText}</h3>
                    </div>
                    <form name="userForm" onSubmit={this.formSubmitted.bind(this)} noValidate>
                        <FormField className="Grid" fieldName="first_name" formError={formError}>
                            <div>
                                <FormLabel title="First name" fieldName="first_name" formError={formError}></FormLabel>
                                <input ref="firstName" className="Form-input Form-offset full" name="name" defaultValue={(userDetails) ? userDetails.first_name : ""} placeholder="Johnny" onChange={this.onChange.bind(this)} />
                                <span className="Form-charm"></span>
                            </div>
                            <div>
                                <FormLabel title="Last name" fieldName="last_name" formError={formError}></FormLabel>
                                <input ref="lastName" className="Form-input Form-offset" name="name" defaultValue={(userDetails) ? userDetails.last_name : ""} placeholder="Appleseed" required onChange={this.onChange.bind(this)} />
                                <span className="Form-charm"></span>
                            </div>
                        </FormField>

                        <FormField fieldName="email" formError={formError}>
                            <FormLabel title="Email address" fieldName="email" formError={formError}></FormLabel>
                            <input ref="email" className="Form-input Form-offset full" name="email" defaultValue={(userDetails) ? userDetails.email : ""} placeholder="youlooknicetoday@email.com" required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="password" formError={formError}>
                            <FormLabel title="Create a password" help="Must be 8 characters long and include one upper case letter, one a number and one special character" fieldName="password" formError={formError}></FormLabel>
                            <input ref="password" className="Form-input Form-offset full" name="password" type="password" defaultValue={(userDetails) ? userDetails.password : ""} placeholder="Shhh..." required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="password_confirm" formError={formError}>
                            <FormLabel title="Confirm password" fieldName="password_confirm" formError={formError}></FormLabel>
                            <input ref="passwordConfirm" className="Form-input Form-offset full" name="passwordConfirm" type="password" defaultValue={(userDetails) ? userDetails.password : ""} placeholder="Shhh... but one more time so we get it right" required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="site_name" formError={formError}>
                            <FormLabel title="Your company or team name" fieldName="site_name" formError={formError}></FormLabel>
                            <input ref="siteName" className="Form-input Form-offset full" name="site_name" type="text" defaultValue={(userDetails) ? userDetails.site_name : ""} placeholder="Department of awesome" required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <div className="Form-actions">
                            <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                                Next
                            </button>
                            <FormMessage></FormMessage>
                        </div>
                    </form>
                </section>
            );
        }
    }
}

UserStep.propTypes = {
    dispatch: PropTypes.func.isRequired,
    stepNumber: PropTypes.number.isRequired
}
