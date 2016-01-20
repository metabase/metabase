import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class TutorialModal extends Component {
    render() {
        const { modalStepIndex, modalStepCount } = this.props;
        return (
            <div className="TutorialModalContent p2">
                <div className="flex">
                    <a className="text-grey-4 p1 cursor-pointer flex-align-right" onClick={this.props.onClose}>
                        <Icon name='close' width="16px" height="16px"/>
                    </a>
                </div>
                <div className="px4">
                    {this.props.children}
                </div>
                <div className="flex">
                    { modalStepIndex > 0 &&
                        <a className="text-grey-4 cursor-pointer" onClick={this.props.onBack}>back</a>
                    }
                    <span className="text-grey-4 flex-align-right">{modalStepIndex + 1} of {modalStepCount}</span>
                </div>
            </div>
        );
    }
}
