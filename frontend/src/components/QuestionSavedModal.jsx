import React, { Component, PropTypes } from "react";

import ModalContent from "metabase/components/ModalContent.jsx";

export default class QuestionSavedModal extends Component {
    static propTypes = {
        addToDashboardFn: PropTypes.func.isRequired,
        closeFn: PropTypes.func.isRequired
    };

    render() {
        return (
            <ModalContent
                title="Salvo! E agora?"
                closeFn={this.props.closeFn}
            >
                <div className="Form-inputs mb4">
                    <ul>
                        <li>
                            <a className="no-decoration flex align-center border-bottom py1 pb2" href="/">
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_home.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Voltar ao início</span>
                            </a>
</li>
                        <li>
                            <a className="no-decoration flex align-center border-bottom py1 pb2" href="#" onClick={this.props.addToDashboardFn}>
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_dashboard.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Adicionar a um painel</span>
                            </a>
</li>
                        <li>
                            <a className="no-decoration flex align-center pt1" href="/q">
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_question.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Continuar fazendo perguntas</span>
                            </a>
                        </li>
                    </ul>
                </div>
            </ModalContent>
        );
    }
}
