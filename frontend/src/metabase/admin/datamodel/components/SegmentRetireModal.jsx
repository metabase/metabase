/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, createRef } from "react";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import ModalContent from "metabase/components/ModalContent";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

export default class SegmentRetireModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      valid: false,
    };
    this.revisionMessage = createRef();
  }

  async handleSubmit() {
    const payload = {
      id: this.props.object.id,
      revision_message: this.revisionMessage.current.value,
    };

    await this.props.onRetire(payload);
    this.props.onClose();
  }

  render() {
    const { valid } = this.state;

    return (
      <ModalContent
        title={t`Retire this segment?`}
        onClose={this.props.onClose}
      >
        <form className={cx(CS.flex, CS.flexColumn, CS.flexFull)}>
          <div className={cx("Form-inputs", CS.pb4)}>
            <p
              className={CS.textParagraph}
            >{t`Saved questions and other things that depend on this segment will continue to work, but it will no longer be selectable from the query builder.`}</p>
            <p className={CS.textParagraph}>
              {t`If you're sure you want to retire this segment, please write a quick explanation of why it's being retired`}
              :
            </p>
            <textarea
              ref={this.revisionMessage}
              className={cx(CS.input, CS.full)}
              placeholder={t`This will show up in the activity feed and in an email that will be sent to anyone on your team who created something that uses this segment.`}
              onChange={e => this.setState({ valid: !!e.target.value })}
            />
          </div>

          <div className={cx("Form-actions", CS.mlAuto)}>
            <a className={ButtonsS.Button} onClick={this.props.onClose}>
              {t`Cancel`}
            </a>
            <ActionButton
              actionFn={this.handleSubmit.bind(this)}
              className={cx(ButtonsS.Button, CS.ml2, {
                [ButtonsS.ButtonDanger]: valid,
                [CS.disabled]: !valid,
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
