/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";

import StepTitle from './StepTitle.jsx'
import CollapsedStep from "./CollapsedStep.jsx";

import _ from "underscore";
import cx from "classnames";

export default class UserStep extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { formError: null, passwordError: null, valid: false, validPassword: false }
    }

    static propTypes = {
        stepNumber: PropTypes.number.isRequired,
        activeStep: PropTypes.number.isRequired,
        setActiveStep: PropTypes.func.isRequired,

        userDetails: PropTypes.object,
        setUserDetails: PropTypes.func.isRequired,
        validatePassword: PropTypes.func.isRequired,
    }

    validateForm() {
        let { valid, validPassword } = this.state;
        let isValid = true;

        // required: first_name, last_name, email, password
        for (var fieldName in this.refs) {
            let node = ReactDOM.findDOMNode(this.refs[fieldName]);
            if (node.required && MetabaseUtils.isEmpty(node.value)) isValid = false;
        }

        if (!validPassword) {
            isValid = false;
        }

        if(isValid !== valid) {
            this.setState({
                'valid': isValid
            });
        }
    }

    async onPasswordBlur() {
        try {
            await this.props.validatePassword(ReactDOM.findDOMNode(this.refs.password).value);

            this.setState({
                passwordError: null,
                validPassword: true
            });
        } catch(error) {
            this.setState({
                passwordError: error.data.errors.password,
                validPassword: false
            });

            MetabaseAnalytics.trackEvent('Setup', 'Error', 'password validation');
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
        if (!MetabaseUtils.validEmail(ReactDOM.findDOMNode(this.refs.email).value)) {
            formErrors.data.errors.email = "Not a valid formatted email address";
        }

        // TODO - validate password complexity

        // validate password match
        if (ReactDOM.findDOMNode(this.refs.password).value !== ReactDOM.findDOMNode(this.refs.passwordConfirm).value) {
            formErrors.data.errors.password_confirm = "Passwords do not match";
        }

        if (_.keys(formErrors.data.errors).length > 0) {
            this.setState({
                formError: formErrors
            });
            return;
        }

        this.props.setUserDetails({
            'nextStep': this.props.stepNumber + 1,
            'details': {
                'first_name': ReactDOM.findDOMNode(this.refs.firstName).value,
                'last_name': ReactDOM.findDOMNode(this.refs.lastName).value,
                'email': ReactDOM.findDOMNode(this.refs.email).value,
                'password': ReactDOM.findDOMNode(this.refs.password).value,
                'site_name': ReactDOM.findDOMNode(this.refs.siteName).value
            }
        });

        MetabaseAnalytics.trackEvent('Setup', 'User Details Step');
    }

    render() {
        let { activeStep, setActiveStep, stepNumber, userDetails } = this.props;
        let { formError, passwordError, valid } = this.state;

        const passwordComplexityDesc = MetabaseSettings.passwordComplexity();
        const stepText = (activeStep <= stepNumber) ? 'What should we call you?' : 'Hi, ' + userDetails.first_name + '. nice to meet you!';

        if (activeStep !== stepNumber) {
            return (<CollapsedStep stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber} setActiveStep={setActiveStep}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep SetupStep--active rounded full relative">
                    <StepTitle title={stepText} number={stepNumber} />
                    <form name="userForm" onSubmit={this.formSubmitted.bind(this)} noValidate className="mt2">
                        <FormField className="Grid mb3" fieldName="first_name" formError={formError}>
                            <div>
                                <FormLabel title="First name" fieldName="first_name" formError={formError}></FormLabel>
                                <input ref="firstName" className="Form-input Form-offset full" name="firstName" defaultValue={(userDetails) ? userDetails.first_name : ""} placeholder="Johnny" autoFocus={true} onChange={this.onChange.bind(this)} />
                                <span className="Form-charm"></span>
                            </div>
                            <div>
                                <FormLabel title="Last name" fieldName="last_name" formError={formError}></FormLabel>
                                <input ref="lastName" className="Form-input Form-offset" name="lastName" defaultValue={(userDetails) ? userDetails.last_name : ""} placeholder="Appleseed" required onChange={this.onChange.bind(this)} />
                                <span className="Form-charm"></span>
                            </div>
                        </FormField>

                        <FormField fieldName="email" formError={formError}>
                            <FormLabel title="Email address" fieldName="email" formError={formError}></FormLabel>
                            <input ref="email" className="Form-input Form-offset full" name="email" defaultValue={(userDetails) ? userDetails.email : ""} placeholder="youlooknicetoday@email.com" required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="password" formError={formError} error={(passwordError !== null)}>
                            <FormLabel title="Create a password" fieldName="password" formError={formError} message={passwordError}></FormLabel>
                            <span style={{fontWeight: "normal"}} className="Form-label Form-offset">{passwordComplexityDesc}</span>
                            <input ref="password" className="Form-input Form-offset full" name="password" type="password" defaultValue={(userDetails) ? userDetails.password : ""} placeholder="Shhh..." required onChange={this.onChange.bind(this)} onBlur={this.onPasswordBlur.bind(this)}/>
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="password_confirm" formError={formError}>
                            <FormLabel title="Confirm password" fieldName="password_confirm" formError={formError}></FormLabel>
                            <input ref="passwordConfirm" className="Form-input Form-offset full" name="passwordConfirm" type="password" defaultValue={(userDetails) ? userDetails.password : ""} placeholder="Shhh... but one more time so we get it right" required onChange={this.onChange.bind(this)} />
                            <span className="Form-charm"></span>
                        </FormField>

                        <FormField fieldName="site_name" formError={formError}>
                            <FormLabel title="Your company or team name" fieldName="site_name" formError={formError}></FormLabel>
                            <input ref="siteName" className="Form-input Form-offset full" name="siteName" type="text" defaultValue={(userDetails) ? userDetails.site_name : ""} placeholder="Department of awesome" required onChange={this.onChange.bind(this)} />
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
