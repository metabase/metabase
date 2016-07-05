import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import cx from "classnames";

import AuthScene from "../components/AuthScene.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";


import * as authActions from "../auth";


const mapStateToProps = (state, props) => {
    return {
        loginError:       state.auth && state.auth.loginError,
        user:             state.currentUser,
        onChangeLocation: props.onChangeLocation
    }
}

const mapDispatchToProps = {
    ...authActions
}

@connect(mapStateToProps, mapDispatchToProps)
export default class LoginApp extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            credentials: {},
            valid: false
        }
    }

    validateForm() {
        let { credentials } = this.state;

        let valid = true;

        if (!credentials.email || !credentials.password) {
            valid = false;
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
        this.setState({ credentials: { ...this.state.credentials, [fieldName]: fieldValue }});
    }

    formSubmitted(e) {
        e.preventDefault();

        let { login, onChangeLocation } = this.props;
        let { credentials } = this.state;

        login(credentials, onChangeLocation);
    }

    render() {
        if (this.props.user) {
            // if we already have a user then we shouldn't be logging in
            this.props.onChangeLocation("/");
        }

        const { loginError } = this.props;

        return (
            <div className="full-height full bg-white flex flex-column flex-full md-layout-centered">
                <div className="Login-wrapper wrapper Grid Grid--full md-Grid--1of2">
                    <div className="Grid-cell flex layout-centered text-brand">
                        <LogoIcon className="Logo my4 sm-my0" width={66} height={85} />
                    </div>
                    <div className="Login-content Grid-cell">
                        <form className="Form-new bg-white bordered rounded shadowed" name="form" onSubmit={(e) => this.formSubmitted(e)} noValidate>
                            <h3 className="Login-header Form-offset mb3">Sign in to Metabase</h3>

                            <FormMessage formError={loginError && loginError.data.message ? loginError : null} ></FormMessage>

                            <FormField key="email" fieldName="email" formError={loginError}>
                                <FormLabel title={"Email address"}  fieldName={"email"} formError={loginError} />
                                <input className="Form-input Form-offset full py1" name="email" placeholder="youlooknicetoday@email.com" type="text" onChange={(e) => this.onChange("email", e.target.value)} autoFocus />
                                <span className="Form-charm"></span>
                            </FormField>

                            <FormField key="password" fieldName="password" formError={loginError}>
                                <FormLabel title={"Password"}  fieldName={"password"} formError={loginError} />
                                <input className="Form-input Form-offset full py1" name="password" placeholder="Shh..." type="password" onChange={(e) => this.onChange("password", e.target.value)} />
                                <span className="Form-charm"></span>
                            </FormField>

                            <div className="Form-field">
                                <ul className="Form-offset">
                                    <input name="remember" type="checkbox" ng-init="remember_me = true" checked /> <label className="inline-block">Remember Me:</label>
                                </ul>
                            </div>

                            <div className="Form-actions p2 Grid Grid--full md-Grid--1of2">
                                <button className={cx("Button Grid-cell", {'Button--primary': this.state.valid})} disabled={!this.state.valid}>
                                    Sign in
                                </button>
                                <a className="Grid-cell py2 sm-py0 text-grey-3 md-text-right text-centered flex-full link" href="/auth/forgot_password" onClick={(e) => { window.OSX ? window.OSX.resetPassword() : null }}>I seem to have forgotten my password</a>
                            </div>
                        </form>
                    </div>
                </div>
                <AuthScene />
            </div>
        );
    }
}
