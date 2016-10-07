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
                id="QuestionSavedModal"
                title="Saved! Add this to a dashboard?"
                closeFn={this.props.closeFn}
                className="Modal-content Modal-content--small NewForm"
            >
                <div className="Form-inputs mb4">
                    <button className="Button Button--primary" onClick={this.props.addToDashboardFn}>Yes please!</button>
                    <button className="Button ml3" onClick={this.props.closeFn}>Not now</button>
                </div>
            </ModalContent>
        );
    }
}
