import React, { Component, PropTypes } from "react";
import _ from "underscore";

import DatabaseDetailsForm from "metabase/components/database/DatabaseDetailsForm.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseCore from "metabase/lib/core";

import StepTitle from './StepTitle.jsx'
import CollapsedStep from "./CollapsedStep.jsx";
import { setDatabaseDetails, validateDatabase } from "../actions";


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
        let engine = React.findDOMNode(this.refs.engine).value;

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
        let { engine } = this.state,
            engines = _.keys(MetabaseCore.ENGINES).sort();

        let options = [(<option value="">Selecione o tipo do banco de dados que você utiliza</option>)];
        engines.forEach(function(opt) {
            options.push((<option key={opt} value={opt}>{MetabaseCore.ENGINES[opt].name}</option>))
        });

        return (
            <label className="Select Form-offset mt1">
                <select ref="engine" defaultValue={engine} onChange={this.chooseDatabaseEngine.bind(this)}>
                    {options}
                </select>
            </label>
        );
    }

    render() {
        let { activeStep, databaseDetails, dispatch, stepNumber } = this.props;
        let { engine, formError } = this.state;

        let stepText = 'Informe seus dados';
        if (activeStep > stepNumber) {
            stepText = (databaseDetails === null) ? "Vou adicionar meus próprios dados mais tarde" : 'Conectado a '+databaseDetails.name;
        }

        if (activeStep !== stepNumber) {
            return (<CollapsedStep dispatch={dispatch} stepNumber={stepNumber} stepText={stepText} isCompleted={activeStep > stepNumber}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active">
                    <StepTitle title={stepText} number={stepNumber} />
                    <div className="mb4">
                        <div style={{maxWidth: 600}} className="Form-field Form-offset">
                        Você vai precisar de algumas informações sobre seu banco de dados, como o nome de usuário e senha. Se você não tem isso agora, Metabase também vem com um conjunto de dados de exemplo que você pode começar a usar.
                        </div>

                        <FormField fieldName="engine">
                            {this.renderEngineSelect()}
                        </FormField>

                        { engine !== "" ?
                            <DatabaseDetailsForm
                                details={(databaseDetails && 'details' in databaseDetails) ? databaseDetails.details : null}
                                engine={engine}
                                formError={formError}
                                hiddenFields={['ssl']}
                                submitFn={this.detailsCaptured.bind(this)}
                                submitButtonText={'Próximo'}>
                            </DatabaseDetailsForm>
                        : null }

                        <div className="Form-field Form-offset">
                            <a className="link" href="#" onClick={this.skipDatabase.bind(this)}>Vou adicionar meus dados mais tarde</a>
                        </div>
                    </div>
                </section>
            );
        }
    }
}
