import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import StepTitle from './StepTitle.jsx'
import CollapsedStep from "./CollapsedStep.jsx";

import DatabaseDetailsForm from "metabase/components/database/DatabaseDetailsForm.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { setDatabaseDetails, validateDatabase } from "../actions";

import _ from "underscore";

export default class DatabaseStep extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { 'engine': "", 'formError': null };
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        stepNumber: PropTypes.number.isRequired
    }

    chooseDatabaseEngine() {
        let engine = ReactDOM.findDOMNode(this.refs.engine).value;

        this.setState({
            'engine': engine
        });

        MetabaseAnalytics.trackEvent('Setup', 'Choose Database', engine);
    }

    async detailsCaptured(details) {
        this.setState({
            'formError': null
        });

        // make sure that we are trying ssl db connections to start with
        details.details.ssl = true;

        try {
            // validate the details before we move forward
            await this.props.dispatch(validateDatabase(details));

        } catch (error) {
            let formError = error;
            details.details.ssl = false;

            try {
                // ssl connection failed, lets try non-ssl
                await this.props.dispatch(validateDatabase(details));

                formError = null;

            } catch (error2) {
                formError = error2;
            }

            if (formError) {
                MetabaseAnalytics.trackEvent('Setup', 'Error', 'database validation: '+this.state.engine);

                this.setState({
                    'formError': formError
                });

                return;
            }
        }

        // now that they are good, store them
        this.props.dispatch(setDatabaseDetails({
            'nextStep': ++this.props.stepNumber,
            'details': details
        }));

        MetabaseAnalytics.trackEvent('Setup', 'Database Step', this.state.engine);
    }

    skipDatabase() {
        this.setState({
            'engine': ""
        });

        this.props.dispatch(setDatabaseDetails({
            'nextStep': ++this.props.stepNumber,
            'details': null
        }));

        MetabaseAnalytics.trackEvent('Setup', 'Database Step');
    }

    renderEngineSelect() {
        let engines = MetabaseSettings.get('engines');
        let { engine } = this.state,
        engineNames = _.keys(engines).sort();

        return (
            <label className="Select Form-offset mt1">
                <select ref="engine" defaultValue={engine} onChange={this.chooseDatabaseEngine.bind(this)}>
                    <option value="">Select the type of Database you use</option>
                    {engineNames.map(opt => <option key={opt} value={opt}>{engines[opt]['driver-name']}</option>)}
                </select>
            </label>
        );
    }

    render() {
        let { activeStep, databaseDetails, dispatch, stepNumber } = this.props;
        let { engine, formError } = this.state;
        let engines = MetabaseSettings.get('engines');

        let stepText = 'Add your data';
        if (activeStep > stepNumber) {
            stepText = (databaseDetails === null) ? "I'll add my own data later" : 'Connecting to '+databaseDetails.name;
        }

        if (activeStep !== stepNumber) {
            return (<CollapsedStep dispatch={dispatch} stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active">
                    <StepTitle title={stepText} number={stepNumber} />
                    <div className="mb4">
                        <div style={{maxWidth: 600}} className="Form-field Form-offset">
                            You’ll need some info about your database, like the username and password.  If you don’t have that right now, Metabase also comes with a sample dataset you can get started with.
                        </div>

                        <FormField fieldName="engine">
                            {this.renderEngineSelect()}
                        </FormField>

                        { engine !== "" ?
                          <DatabaseDetailsForm
                              details={(databaseDetails && 'details' in databaseDetails) ? databaseDetails.details : null}
                              engine={engine}
                              engines={engines}
                              formError={formError}
                              hiddenFields={{ ssl: true }}
                              submitFn={this.detailsCaptured.bind(this)}
                              submitButtonText={'Next'}>
                          </DatabaseDetailsForm>
                          : null }

                          <div className="Form-field Form-offset">
                              <a className="link" href="#" onClick={this.skipDatabase.bind(this)}>I'll add my data later</a>
                          </div>
                    </div>
                </section>
            );
        }
    }
}
