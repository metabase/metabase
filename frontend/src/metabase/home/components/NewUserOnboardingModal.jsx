import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";

export default class NewUserOnboardingModal extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {step: 1};
    }

    static propTypes = {
        onClose: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired
    }

    getStepCount() {
        return MetabaseSettings.get("has_sample_dataset") ? 3 : 2
    }

    nextStep() {
        let nextStep = this.state.step + 1;
        if (nextStep <= this.getStepCount()) {
            this.setState({ step: this.state.step + 1 });
        } else {
            this.closeModal();
        }
    }

    closeModal() {
        this.props.onClose();
    }

    renderStep() {
        return <span>STEP {this.state.step} of {this.getStepCount()}</span>;
    }

    render() {
        const { user } = this.props;
        const { step } = this.state;

        return (
            <div>
                { step === 1 ?
                    <div className="bordered rounded shadowed">
                        <img width="560" height="224" src="app/assets/img/welcome-modal-1.png" />
                        <div className="pl4 pr4 pt4 pb1">
                            <h2>Ask questions and explore</h2>
                            <p>Click on charts or tables to explore, or ask a new question using the easy interface or the powerful SQL editor.</p>
                        </div>
                        <button className="Button Button--primary flex-align-right" onClick={() => (this.nextStep())}>Next</button>
                    </div>
                : step === 2 ?
                    <div className="bordered rounded shadowed">
                        <img width="560" height="262" src="app/assets/img/welcome-modal-2.png" />
                        <div className="pl4 pr4 pt4 pb1">
                            <h2>Make your own charts</h2>
                            <p className="clearfix pt1">Create line charts, scatter plots, maps, and more.</p>
                        </div>
                        <button className="Button Button--primary flex-align-right" onClick={() => (this.nextStep())}>Next</button>
                    </div>
                :
                    <div className="bordered rounded shadowed">
                        <img width="560" height="295" src="app/assets/img/welcome-modal-3.png" />
                        <div className="pl4 pr4 pt4 pb1">
                            <h2>Share what you find</h2>
                            <p>Create powerful and flexible dashboards, and send regular updates via email or Slack.</p>
                        </div>

                        <span className="flex-align-right">
                            <a className="text-underline-hover cursor-pointer mr3" onClick={() => (this.closeModal())}>Let's go!</a>
                        </span>
                    </div>
                }
            </div>
        );
    }
}
