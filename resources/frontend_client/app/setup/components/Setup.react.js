"use strict";

import React, { Component, PropTypes } from "react";

import LogoIcon from 'metabase/components/LogoIcon.react';
import UserStep from './UserStep.react';
import DatabaseStep from './DatabaseStep.react';
import PreferencesStep from './PreferencesStep.react';

import { setActiveStep } from '../actions';

const WELCOME_STEP_NUMBER = 0;
const USER_STEP_NUMBER = 1;
const DATABASE_STEP_NUMBER = 2;
const PREFERENCES_STEP_NUMBER = 3;


export default class Setup extends Component {

    completeWelcome() {
        this.props.dispatch(setActiveStep(USER_STEP_NUMBER));
    }

    renderFooter() {
        return (
            <div className="SetupHelp bordered border-dashed p2 rounded mb4" >
                If you feel stuck, <a className="link" href="http://www.metabase.com/docs/latest/getting-started">our getting started guide</a> is just a click away.
            </div>
        );
    }

    render() {
        let { activeStep, setupComplete } = this.props;

        if (activeStep === WELCOME_STEP_NUMBER) {
            return (
                <div className="flex flex-column flex-full">
                    <div className="wrapper flex flex-column layout-centered wrapper wrapper--trim">
                        <section className="wrapper wrapper--trim flex layout-centered full-height flex-column">
                            <LogoIcon className="text-brand" width={109} height={138}></LogoIcon>
                            <div className="WelcomeMessage text-centered">
                                <h1 className="WelcomeMessage-title text-brand">Welcome to Metabase</h1>
                                <p className="WelcomeMessage-subTitle text-body">Looks like everything is installed and working great. We’ll quickly get to know you, connect you to your data, and we’ll have you on your way  to your data.</p>
                            </div>
                            <button className="Button Button--primary" onClick={() => (this.completeWelcome())}>Lets get started</button>
                        </section>

                        {this.renderFooter()}
                    </div>
                </div>
            );

        } else {
            return (
                <div className="flex flex-column flex-full">
                    <nav className="SetupNav text-brand py2 flex layout-centered">
                        <LogoIcon width={41} height={51}></LogoIcon>
                    </nav>

                    <div className="wrapper wrapper--small flex flex-column layout-centered">
                        <div className="SetupSteps full">

                            <UserStep {...this.props} stepNumber={USER_STEP_NUMBER} />
                            <DatabaseStep {...this.props} stepNumber={DATABASE_STEP_NUMBER} />
                            <PreferencesStep {...this.props} stepNumber={PREFERENCES_STEP_NUMBER} />

                            { setupComplete ?
                                <section className="SetupStep rounded SetupStep--active flex flex-column layout-centered p4">
                                    <h1 style={{fontSize: "xx-large"}} className="text-normal pt2">You're all set up!</h1>
                                    <div className="pt4 pb2">
                                        <a className="Button Button--primary" href="/">Take me to Metabase</a>
                                    </div>
                                </section>
                            : null }
                        </div>

                        {this.renderFooter()}
                    </div>
                </div>
            );
        }
    }
}

Setup.propTypes = {
    dispatch: PropTypes.func.isRequired
}
