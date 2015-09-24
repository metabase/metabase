"use strict";

import React, { Component, PropTypes } from "react";

import FormField from "metabase/components/form/FormField.react";
import FormLabel from "metabase/components/form/FormLabel.react";
import FormMessage from "metabase/components/form/FormMessage.react";
import Icon from "metabase/components/Icon.react";
import CollapsedStep from "./CollapsedStep.react";

import { setUserDetails } from "../actions";


export default class UserStep extends Component {

    formSubmitted(e) {
        e.preventDefault();

        // validate email address
        // validate password

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
        const stepText = (activeStep <= stepNumber) ? 'What should we call you?' : 'Hi, ' + userDetails.first_name + '. nice to meet you!';

        if (activeStep !== stepNumber) {
            return (<CollapsedStep dispatch={dispatch} stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active shadowed">
                    <div className="flex align-center py3">
                        <span className="SetupStep-indicator flex layout-centered absolute bordered">
                            <span className="SetupStep-number">{stepNumber}</span>
                            <Icon name={'check'} className="SetupStep-check" width={16} height={16}></Icon>
                        </span>
                        <h3 className="SetupStep-title ml4 my1">{stepText}</h3>
                    </div>
                    <form name="userForm" onSubmit={this.formSubmitted.bind(this)} noValidate>
                        <FormField className="Grid" fieldName="first_name">
                            <div>
                                <FormLabel title="First name" fieldName="first_name"></FormLabel>
                                <input ref="firstName" className="Form-input Form-offset full" name="name" placeholder="Johnny" required autofocus />
                                <span className="Form-charm"></span>
                            </div>
                            <div>
                                <FormLabel title="Last name" fieldName="last_name"></FormLabel>
                                <input ref="lastName" className="Form-input Form-offset" name="name" placeholder="Appleseed" required />
                                <span className="Form-charm"></span>
                            </div>
                        </FormField>

                        <FormField fieldName="email">
                            <FormLabel title="Email address" fieldName="email"></FormLabel>
                            <input ref="email" className="Form-input Form-offset full" name="email" placeholder="youlooknicetoday@email.com" required />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="password">
                            <FormLabel title="Create a password" help="Must be 8 characters long and include one upper case letter, one a number and one special character" fieldName="password"></FormLabel>
                            <input ref="password" className="Form-input Form-offset full" name="password" type="password" placeholder="Shhh..." required />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="repeated_password">
                            <FormLabel title="Confirm password" fieldName="password"></FormLabel>
                            <input ref="passwordConfirm" className="Form-input Form-offset full" name="passwordConfirm" type="password" placeholder="Shhh... but one more time so we get it right" required />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="value">
                            <FormLabel title="Your company or team name" fieldName="value"></FormLabel>
                            <input ref="siteName" className="Form-input Form-offset full" name="value" type="text" placeholder="Department of awesome" required />
                            <span className="Form-charm"></span>
                        </FormField>

                        <div className="Form-actions">
                            <button className="Button" ng-className="{'Button--primary': userForm.$valid}" ng-disabled="!userForm.$valid">
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
