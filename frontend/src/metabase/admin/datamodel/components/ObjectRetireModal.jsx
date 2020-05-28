import React, { Component } from "react";
import ReactDOM from "react-dom";

import ActionButton from "metabase/components/ActionButton";
import ModalContent from "metabase/components/ModalContent";
import { t } from "ttag";
import cx from "classnames";

export default class ObjectRetireModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      valid: false,
    };
  }

  async handleSubmit() {
    const payload = {
      id: this.props.object.id,
      revision_message: ReactDOM.findDOMNode(this.refs.revision_message).value,
    };

    await this.props.onRetire(payload);
    this.props.onClose();
  }

  render() {
    const { objectType } = this.props;
    const { valid } = this.state;
    return (
      <ModalContent
        title={t`Retire this ${objectType}?`}
        onClose={this.props.onClose}
      >
        <form className="flex flex-column flex-full">
          <div className="Form-inputs pb4">
            <p className="text-paragraph">{t`Saved questions and other things that depend on this ${objectType} will continue to work, but this ${objectType} will no longer be selectable from the query builder.`}</p>
            <p className="text-paragraph">{t`If you're sure you want to retire this ${objectType}, please write a quick explanation of why it's being retired:`}</p>
            <textarea
              ref="revision_message"
              className="input full"
              placeholder={t`This will show up in the activity feed and in an email that will be sent to anyone on your team who created something that uses this ${objectType}.`}
              onChange={e => this.setState({ valid: !!e.target.value })}
            />
          </div>

          <div className="Form-actions ml-auto">
            <a className="Button" onClick={this.props.onClose}>
              {t`Cancel`}
            </a>
            <ActionButton
              actionFn={this.handleSubmit.bind(this)}
              className={cx("Button ml2", {
                "Button--danger": valid,
                disabled: !valid,
              })}
              normalText={t`Retire`}
              activeText={t`Retiring…`}
              failedText={t`Failed`}
              successText={t`Success`}
            />
          </div>
        </form>
      </ModalContent>
    );
  }
}
