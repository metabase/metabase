import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";

const ENABLE_BACK_BUTTON = false; // disabled due to possibility of getting in inconsistent states

export default class TutorialModal extends Component {
    render() {
        const { modalStepIndex, modalStepCount } = this.props;
        let showStepCount = modalStepIndex != null;
        let showBackButton = (ENABLE_BACK_BUTTON && modalStepIndex > 0);
        return (
            <div className="TutorialModalContent p2">
                <div className="flex">
                    <a className="text-grey-4 p1 cursor-pointer flex-align-right" onClick={this.props.onClose}>
                        <Icon name='close' size={16}/>
                    </a>
                </div>
                <div className="px4">
                    {this.props.children}
                </div>
                <div className="flex">
                    { showBackButton && <a className="text-grey-4 cursor-pointer" onClick={this.props.onBack}>back</a> }
                    { showStepCount && <span className="text-grey-4 flex-align-right">{modalStepIndex + 1} of {modalStepCount}</span> }
                </div>
            </div>
        );
    }
}
