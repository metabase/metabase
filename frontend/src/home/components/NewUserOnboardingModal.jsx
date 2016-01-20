import React, { Component, PropTypes } from "react";

export default class NewUserOnboardingModal extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {step: 1};
    }

    static propTypes = {
        closeFn: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired
    }

    step(step) {
        this.setState({ step });
    }

    closeModal() {
        this.props.closeFn();
    }

    render() {
        const { user } = this.props;
        const { step } = this.state;

        return (
            <div>
                { step === 1 ?
                    <div className="bordered rounded shadowed">
                        <div className="pl4 pr4 pt4 pb1 border-bottom">
                            <h2>{user.first_name}, welcome to Metabase!</h2>
                            <h2>Analytics you can use by yourself.</h2>

                            <p>Metabase lets you find answers to your questions from data your company already has.</p>

                            <p>It’s easy to use, because it’s designed so you don’t need any analytics knowledge to get started.</p>
                        </div>
                        <div className="px4 py2 text-grey-2 flex align-center">
                            STEP 1 of 3
                            <button className="Button Button--primary flex-align-right" onClick={() => (this.step(2))}>Continue</button>
                        </div>
                    </div>
                : step === 2 ?
                    <div className="bordered rounded shadowed">
                        <div className="pl4 pr4 pt4 pb1 border-bottom">
                            <h2>Just 3 things worth knowing</h2>

                            <p className="clearfix pt1"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_tables.png" />All of your data is organized in Tables. Think of them in terms of Excel spreadsheets with columns and rows.</p>

                            <p className="clearfix"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_questions.png" />To get answers, you Ask Questions by picking a table and a few other parameters. You can visualize the answer in many ways, including cool charts.</p>

                            <p className="clearfix"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_dashboards.png" />You (and anyone on your team) can save answers in Dashboards, so you can check them often. It's a great way to quickly see a snapshot of your business.</p>
                        </div>
                        <div className="px4 py2 text-grey-2 flex align-center">
                            STEP 2 of 3
                            <button className="Button Button--primary flex-align-right" onClick={() => (this.step(3))}>Continue</button>
                        </div>
                    </div>
                :
                    <div className="bordered rounded shadowed">
                        <div className="pl4 pr4 pt4 pb1 border-bottom">
                            <h2>Let's try asking a question!</h2>

                            <p>We'll take a quick look at the Query Builder, the main tool you'll use in Metabase to ask questions.</p>
                        </div>
                        <div className="px4 py2 text-grey-2 flex align-center">
                            STEP 3 of 3
                            <span className="flex-align-right">
                                <a className="text-underline-hover cursor-pointer mr3" onClick={() => (this.closeModal())}>skip for now</a>
                                <a className="Button Button--primary" href="/q?tutorial">Let's do it!</a>
                            </span>
                        </div>
                    </div>
                }
            </div>
        );
    }
}
