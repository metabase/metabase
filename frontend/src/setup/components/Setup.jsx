import React, { Component, PropTypes } from "react";

import LogoIcon from 'metabase/components/LogoIcon.jsx';
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import UserStep from './UserStep.jsx';
import DatabaseStep from './DatabaseStep.jsx';
import PreferencesStep from './PreferencesStep.jsx';

import { setActiveStep } from '../actions';

const WELCOME_STEP_NUMBER = 0;
const USER_STEP_NUMBER = 1;
const DATABASE_STEP_NUMBER = 2;
const PREFERENCES_STEP_NUMBER = 3;


export default class Setup extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired
    }

    completeWelcome() {
        this.props.dispatch(setActiveStep(USER_STEP_NUMBER));
        MetabaseAnalytics.trackEvent('Setup', 'Welcome');
    }

    completeSetup() {
        MetabaseAnalytics.trackEvent('Setup', 'Complete');
    }

    renderFooter() {
        const { tag } = MetabaseSettings.get('version');
        return (
            <div className="SetupHelp bordered border-dashed p2 rounded mb4" >
                Se você está com dúvidas, acesse <a className="link" href={"http://www.metabase.com/docs/"+tag+"/setting-up-metabase"} target="_blank">nosso Guia de introdução</a> com apenas um clique.
            </div>
        );
    }

    render() {
        let { activeStep, setupComplete } = this.props;

        if (activeStep === WELCOME_STEP_NUMBER) {
            return (
                <div className="relative flex flex-full layout-centered">
                    <div className="wrapper wrapper--trim text-centered">
                        <LogoIcon className="text-brand mb4" width={89} height={118}></LogoIcon>
                        <div className="relative z2 text-centered ml-auto mr-auto" style={{maxWidth: 550}}>
                            <h1 style={{fontSize: '2.2rem'}} className="text-brand">Bem-vindo ao Metabase</h1>
                            <p className="text-body">Parece que tudo está funcionando. Agora vamos começar a conhecê-lo, se conectar a seus dados e começar a encontrar algumas respostas!</p>
                            <button className="Button Button--primary mt4" onClick={() => (this.completeWelcome())}>Vamos começar</button>
                        </div>
                        <div className="absolute z1 bottom left right">
                            <div className="inline-block">
                                {this.renderFooter()}
                            </div>
                        </div>
                    </div>
                </div>
            );
        } else {
            return (
                <div>
                    <nav className="SetupNav text-brand py2 flex layout-centered">
                        <LogoIcon width={41} height={51}></LogoIcon>
                    </nav>

                    <div className="wrapper wrapper--small">
                        <div className="SetupSteps full">

                            <UserStep {...this.props} stepNumber={USER_STEP_NUMBER} />
                            <DatabaseStep {...this.props} stepNumber={DATABASE_STEP_NUMBER} />
                            <PreferencesStep {...this.props} stepNumber={PREFERENCES_STEP_NUMBER} />

                            { setupComplete ?
                                <section className="SetupStep rounded SetupStep--active flex flex-column layout-centered p4">
                                    <h1 style={{fontSize: "xx-large"}} className="text-normal pt2">Tudo pronto!</h1>
                                    <div className="pt4 pb2">
                                        <a className="Button Button--primary" href="/?new" onClick={this.completeSetup.bind(this)}>Acessar o Metabase</a>
                                    </div>
                                </section>
                            : null }
                            <div className="text-centered">
                                {this.renderFooter()}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }
}
