/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import StepTitle from './StepTitle.jsx'
import CollapsedStep from "./CollapsedStep.jsx";

import DatabaseDetailsForm from "metabase/components/DatabaseDetailsForm.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import _ from "underscore";
import { DEFAULT_SCHEDULES } from "metabase/admin/databases/database";
import DatabaseSchedulingForm from "metabase/admin/databases/components/DatabaseSchedulingForm";

export default class DatabaseStep extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { 'engine': "", 'formError': null };
    }

    static propTypes = {
        stepNumber: PropTypes.number.isRequired,
        activeStep: PropTypes.number.isRequired,
        setActiveStep: PropTypes.func.isRequired,

        databaseDetails: PropTypes.object,
        validateDatabase: PropTypes.func.isRequired,
        setDatabaseDetails: PropTypes.func.isRequired,
    }

    chooseDatabaseEngine() {
        let engine = ReactDOM.findDOMNode(this.refs.engine).value;

        this.setState({
            'engine': engine
        });

        MetabaseAnalytics.trackEvent('Setup', 'Choose Database', engine);
    }

    connectionDetailsCaptured = async (database) => {
        this.setState({
            'formError': null
        });

        // make sure that we are trying ssl db connections to start with
        database.details.ssl = true;

        try {
            // validate the details before we move forward
            await this.props.validateDatabase(database);

        } catch (error) {
            let formError = error;
            database.details.ssl = false;

            try {
                // ssl connection failed, lets try non-ssl
                await this.props.validateDatabase(database);

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

        if (database.details["let-user-control-scheduling"]) {
            // Show the scheduling step if user has chosen to control scheduling manually
            // Add the default schedules because DatabaseSchedulingForm requires them and update the db state
            // Keep the step same as we conditionally show the scheduling settings in this component
            this.props.setDatabaseDetails({
                'nextStep': this.props.stepNumber,
                'details': {
                    ...database,
                    is_full_sync: true,
                    schedules: DEFAULT_SCHEDULES
                }
            });
        } else {
            // now that they are good, store them
            this.props.setDatabaseDetails({
                'nextStep': this.props.stepNumber + 1,
                'details': database
            });

            MetabaseAnalytics.trackEvent('Setup', 'Database Step', this.state.engine);
        }

    }

    schedulingDetailsCaptured = async (database) => {
        this.props.setDatabaseDetails({
            'nextStep': this.props.stepNumber + 1,
            'details': database
        });

        MetabaseAnalytics.trackEvent('Setup', 'Database Step', this.state.engine);
    }

    skipDatabase() {
        this.setState({
            'engine': ""
        });

        this.props.setDatabaseDetails({
            'nextStep': this.props.stepNumber + 1,
            'details': null
        });

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
        let { activeStep, databaseDetails, setActiveStep, stepNumber } = this.props;
        let { engine, formError } = this.state;
        let engines = MetabaseSettings.get('engines');

        let stepText = 'Add your data';
        if (activeStep > stepNumber) {
            stepText = (databaseDetails === null) ? "I'll add my own data later" : 'Connecting to '+databaseDetails.name;
        }

        const inSchedulingStep = databaseDetails && databaseDetails.details["let-user-control-scheduling"];

        if (activeStep !== stepNumber) {
            return (<CollapsedStep stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber} setActiveStep={setActiveStep}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active">
                    <StepTitle title={stepText} number={stepNumber} />
                    <div className="mb4">
                        <div style={{maxWidth: 600}} className="Form-field Form-offset">
                            You’ll need some info about your database, like the username and password.  If you don’t have that right now, Metabase also comes with a sample dataset you can get started with.
                        </div>

                        {!inSchedulingStep ?
                            <FormField fieldName="engine">
                                {this.renderEngineSelect()}
                            </FormField>
                        : null }

                        { engine !== "" && !inSchedulingStep ?
                          <DatabaseDetailsForm
                              details={(databaseDetails && 'details' in databaseDetails) ? databaseDetails.details : null}
                              engine={engine}
                              engines={engines}
                              formError={formError}
                              hiddenFields={{ ssl: true }}
                              submitFn={this.connectionDetailsCaptured}
                              submitButtonText={'Next'}>
                          </DatabaseDetailsForm>
                          : null }

                        { engine !== "" && inSchedulingStep ?
                            <div className="text-default">
                                <DatabaseSchedulingForm
                                    database={databaseDetails}
                                    formState={{ formError }}
                                    // Use saveDatabase both for db creation and updating
                                    save={this.schedulingDetailsCaptured}
                                    submitButtonText={ "Next"}
                                />
                            </div>
                            : null }

                          <div className="Form-field Form-offset">
                              <a className="link" onClick={this.skipDatabase.bind(this)}>I'll add my data later</a>
                          </div>
                    </div>
                </section>
            );
        }
    }
}
