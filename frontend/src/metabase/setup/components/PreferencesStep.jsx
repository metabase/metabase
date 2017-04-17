/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import Toggle from "metabase/components/Toggle.jsx";

import StepTitle from './StepTitle.jsx';
import CollapsedStep from "./CollapsedStep.jsx";


export default class PreferencesStep extends Component {

    static propTypes = {
        stepNumber: PropTypes.number.isRequired,
        activeStep: PropTypes.number.isRequired,
        setActiveStep: PropTypes.func.isRequired,

        allowTracking: PropTypes.bool.isRequired,
        setAllowTracking: PropTypes.func.isRequired,
        setupComplete: PropTypes.bool.isRequired,
        submitSetup: PropTypes.func.isRequired,
    }

    toggleTracking() {
        let { allowTracking } = this.props;

        this.props.setAllowTracking(!allowTracking);
    }

    async formSubmitted(e) {
        e.preventDefault();

        // okay, this is the big one.  we actually submit everything to the api now and complete the process.
        this.props.submitSetup();

        MetabaseAnalytics.trackEvent('Setup', 'Preferences Step', this.props.allowTracking);
    }

    render() {
        let { activeStep, allowTracking, setupComplete, stepNumber, setActiveStep } = this.props;
        const { tag } = MetabaseSettings.get('version');

        let stepText = 'Usage data preferences';
        if (setupComplete) {
            stepText = allowTracking ? "Thanks for helping us improve" : "We won't collect any usage events";
        }

        if (activeStep !== stepNumber || setupComplete) {
            return (<CollapsedStep stepNumber={stepNumber} stepText={stepText} isCompleted={setupComplete} setActiveStep={setActiveStep}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active">
                    <StepTitle title={stepText} number={stepNumber} />
                    <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                        <div className="Form-field Form-offset">
                            In order to help us improve Metabase, we'd like to collect certain data about usage through Google Analytics.  <a className="link" href={"http://www.metabase.com/docs/"+tag+"/information-collection.html"} target="_blank">Here's a full list of everything we track and why.</a>
                        </div>

                        <div className="Form-field Form-offset mr4">
                            <div style={{borderWidth: "2px"}} className="flex align-center bordered rounded p2">
                                <Toggle value={allowTracking} onChange={this.toggleTracking.bind(this)} className="inline-block" />
                                <span className="ml1">Allow Metabase to anonymously collect usage events</span>
                            </div>
                        </div>

                        { allowTracking ?
                            <div className="Form-field Form-offset">
                                <ul style={{listStyle: "disc inside", lineHeight: "200%"}}>
                                    <li>Metabase <span style={{fontWeight: "bold"}}>never</span> collects anything about your data or question results.</li>
                                    <li>All collection is completely anonymous.</li>
                                    <li>Collection can be turned off at any point in your admin settings.</li>
                                </ul>
                            </div>
                        : null }

                        <div className="Form-actions">
                            <button className="Button Button--primary">
                                Next
                            </button>
                            { /* FIXME: <mb-form-message form="usageForm"></mb-form-message>*/ }
                        </div>
                    </form>
                </section>
            );
        }
    }
}
