import React, { Component, PropTypes } from "react";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import Toggle from "metabase/components/Toggle.jsx";

import StepTitle from './StepTitle.jsx';
import CollapsedStep from "./CollapsedStep.jsx";
import { setAllowTracking, submitSetup } from "../actions";


export default class PreferencesStep extends Component {

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        stepNumber: PropTypes.number.isRequired
    }

    toggleTracking() {
        let { allowTracking } = this.props;

        this.props.dispatch(setAllowTracking(!allowTracking));
    }

    async formSubmitted(e) {
        e.preventDefault();

        // okay, this is the big one.  we actually submit everything to the api now and complete the process.
        this.props.dispatch(submitSetup());

        MetabaseAnalytics.trackEvent('Setup', 'Preferences Step', this.props.allowTracking);
    }

    render() {
        let { activeStep, allowTracking, setupComplete, stepNumber } = this.props;
        const { tag } = MetabaseSettings.get('version');

        let stepText = 'Preferência de uso de dados';
        if (setupComplete) {
            stepText = allowTracking ? "Thanks for helping us improve" : "We won't collect any usage events";
        }

        if (activeStep !== stepNumber || setupComplete) {
            return (<CollapsedStep stepNumber={stepNumber} stepText={stepText} isCompleted={setupComplete}></CollapsedStep>)
        } else {
            return (
                <section className="SetupStep rounded full relative SetupStep--active">
                    <StepTitle title={stepText} number={stepNumber} />
                    <form onSubmit={this.formSubmitted.bind(this)} novalidate>
                        <div className="Form-field Form-offset">
                        A fim de nos ajudar a melhorar o Metabase, nós gostaríamos de recolher determinados dados sobre o uso do Google Analytics.  <a className="link" href={"http://www.metabase.com/docs/"+tag+"/information-collection.html"} target="_blank">Esta é ima lista completa de tudo o que é monitorado e por quê</a>
                        </div>

                        <div className="Form-field Form-offset mr4">
                            <div style={{borderWidth: "2px"}} className="flex align-center bordered rounded p2">
                                <Toggle value={allowTracking} onChange={this.toggleTracking.bind(this)} className="inline-block" />
                                <span className="ml1">Autorizar o Metabase a coletar anonimamente eventos de seu uso</span>
                            </div>
                        </div>

                        { allowTracking ?
                            <div className="Form-field Form-offset">
                                <ul style={{listStyle: "disc inside", lineHeight: "200%"}}>
                                    <li>Metabase <span style={{fontWeight: "bold"}}>nunca</span> coleta nada sobre seus dados ou resultados das perguntas.</li>
                                    <li>Toda coleta é totalmente anonima.</li>
                                    <li>Coletas podem ser desativadas a quaquer momento nas configurações do administrador.</li>
                                </ul>
                            </div>
                        : null }

                        <div className="Form-actions">
                            <button className="Button Button--primary" ng-click="setUsagePreference()">
                                Próximo
                            </button>
                            <mb-form-message form="usageForm"></mb-form-message>
                        </div>
                    </form>
                </section>
            );
        }
    }
}
