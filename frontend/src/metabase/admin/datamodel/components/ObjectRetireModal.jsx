import React, { Component } from "react";
import ReactDOM from "react-dom";

import ActionButton from "metabase/components/ActionButton.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import { capitalize } from "metabase/lib/formatting";
import cx from "classnames";

export default class ObjectRetireModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            valid: false
        };
    }

    async handleSubmit() {
        const { object, objectType } = this.props;
        let payload = {
            revision_message: ReactDOM.findDOMNode(this.refs.revision_message).value
        };
        payload[objectType+"Id"] = object.id;

        await this.props.onRetire(payload);
        this.props.onClose();
    }

    render() {
        const { objectType } = this.props;
        const { valid } = this.state;
        return (
            <ModalContent
                title={"Retire This " + capitalize(objectType)}
                onClose={this.props.onClose}
            >
                <form className="flex flex-column flex-full">
                    <div className="Form-inputs pb4">
                        <p>Saved questions and other things that depend on this {objectType} will continue to work, but this {objectType} will no longer be selectable from the query builder.</p>
                        <p>If you're sure you want to retire this {objectType}, please write a quick explanation of why it's being retired:</p>
                        <textarea
                            ref="revision_message"
                            className="input full"
                            placeholder={"This will show up in the activity feed and in an email that will be sent to anyone on your team who created something that uses this " + objectType + "."}
                            onChange={(e) => this.setState({ valid: !!e.target.value })}
                        />
                    </div>

                    <div className="Form-actions">
                        <ActionButton
                            actionFn={this.handleSubmit.bind(this)}
                            className={cx("Button", { "Button--primary": valid, "disabled": !valid })}
                            normalText="Retire"
                            activeText="Retiring…"
                            failedText="Failed"
                            successText="Success"
                        />
                        <a className="Button Button--borderless" onClick={this.props.onClose}>
                            Cancel
                        </a>
                    </div>
                </form>
            </ModalContent>
        );
    }
}
