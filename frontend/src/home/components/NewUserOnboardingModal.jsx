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

    stepTwo() {
        this.setState({step: 2});
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
                            <h2>{user.first_name}, bem-vindo ao Metabase!</h2>
                            <h2>Análises podem ser feitas por você mesmo</h2>

                            <p>Metabase permite encontrar respostas para as suas perguntas a partir de dados que sua empresa já possui.</p>

                            <p>É fácil de usar, porque ele é projetado para que você não precisa de nenhum conhecimento de análise para começar.</p>
                        </div>
                        <div className="px4 py2 text-grey-2 flex align-center">
                            PASSO 1 de 2
                            <button className="Button Button--primary flex-align-right" onClick={() => (this.stepTwo())}>Continuar</button>
                        </div>
                    </div>
                :
                    <div className="bordered rounded shadowed">
                        <div className="pl4 pr4 pt4 pb1 border-bottom">
                            <h2>Apenas 3 coisas que valem a pena conhecer</h2>

                            <p className="clearfix pt1"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_tables.png" />Todos os seus dados são organizados em tabelas. Pense neles em termos de planilhas do Excel com colunas e linhas.</p>

                            <p className="clearfix"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_questions.png" />Para obter respostas, você faz perguntas escolhendo tabelas e alguns outros parâmetros. Você pode visualizar a resposta de muitas maneiras, incluindo gráficos legais.</p>

                            <p className="clearfix"><img className="float-left mr2" width="40" height="40" src="/app/home/partials/onboarding_illustration_dashboards.png" />Você (e qualquer um em sua equipe) pode salvar respostas em painéis, para que você possa vê-las muitas vezes. É uma ótima maneira de ver informações instantâneas de seu negócio.</p>
                        </div>
                        <div className="px4 py2 text-grey-2 flex align-center">
                            PASSO 2 de 2
                            <a className="Button Button--primary flex-align-right" href="/" onClick={() => (this.closeModal())}>Continuar</a>
                        </div>
                    </div>
                }
            </div>
        );
    }
}
