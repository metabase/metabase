"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";

import DatabaseDetailsForm from "metabase/components/database/DatabaseDetailsForm.react";
import FormField from "metabase/components/form/FormField.react";
import Icon from "metabase/components/Icon.react";
import MetabaseCore from "metabase/lib/core";

import CollapsedStep from "./CollapsedStep.react";
import { setDatabaseDetails, validateDatabase } from "../actions";


export default class DatabaseStep extends Component {

    constructor(props) {
        super(props);
        this.state = { 'engine': "", 'formError': null };
    }

    chooseDatabaseEngine() {
        let engine = React.findDOMNode(this.refs.engine).value;

        this.setState({
            'engine': engine
        });
    }

    async detailsCaptured(details) {
        let databaseDetails = _.clone(details);
        databaseDetails.engine = this.state.engine;

        this.setState({
            'formError': null
        });

        try {
            // validate them first
            await this.props.dispatch(validateDatabase(databaseDetails));

            // now that they are good, store them
            this.props.dispatch(setDatabaseDetails({
                'nextStep': ++this.props.stepNumber,
                'details': databaseDetails
            }));
        } catch (error) {
            this.setState({
                'formError': error
            });
        }
    }

    skipDatabase() {
        this.setState({
            'engine': ""
        });

        this.props.dispatch(setDatabaseDetails({
            'nextStep': ++this.props.stepNumber,
            'details': null
        }));
    }

    renderEngineSelect() {
        let { engine } = this.state;
        let options = [(<option value="">Select the type of Database you use</option>)];

        for (var opt in MetabaseCore.ENGINES) {
            options.push((<option key={opt} value={opt}>{MetabaseCore.ENGINES[opt].name}</option>))
        }

        return (
            <label className="Select Form-offset mt1">
                <select ref="engine" className="Select" defaultValue={engine} onChange={this.chooseDatabaseEngine.bind(this)}>
                    {options}
                </select>
            </label>
        );
    }

    render() {
        let { activeStep, databaseDetails, dispatch, stepNumber } = this.props;
        let { engine, formError } = this.state;

        let stepText = 'Add your data';
        if (activeStep > stepNumber) {
            stepText = (databaseDetails === null) ? "I'll add my own data later" : 'Connecting to '+databaseDetails.name;
        }

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
                    <div>
                        <div className="Form-field Form-offset">
                            You’ll need some info about your database, like the username and password.  If you don’t have that right now, Metabase also comes with an Sample dataset you can get started with.
                        </div>

                        <FormField fieldName="engine">
                            {this.renderEngineSelect()}
                        </FormField>

                        { engine !== "" ?
                            <DatabaseDetailsForm
                                details={databaseDetails}
                                engine={engine}
                                formError={formError}
                                hiddenFields={['ssl']}
                                submitFn={this.detailsCaptured.bind(this)}
                                submitButtonText={'Next'}>
                            </DatabaseDetailsForm>
                        : null }

                        <div className="Form-field Form-offset">
                            <a href="#" onClick={this.skipDatabase.bind(this)}>I'll add my data later</a>
                        </div>
                    </div>
                </section>
            );
        }
    }
}

DatabaseStep.propTypes = {
    dispatch: PropTypes.func.isRequired,
    stepNumber: PropTypes.number.isRequired
}
