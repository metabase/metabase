/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

import AlertModalsS from "./AlertModals.module.css";
import { DangerZone } from "./AlertModals.styled";

export class DeleteAlertSection extends Component {
  getConfirmItems() {
    // same as in PulseEdit but with some changes to copy
    return this.props.alert.channels.map((c, index) =>
      c.channel_type === "email" ? (
        <span
          key={`${c.channel_type}-${index}`}
        >{jt`This alert will no longer be emailed to ${(
          <strong>
            {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
              c.recipients.length,
            )}
          </strong>
        )}.`}</span>
      ) : c.channel_type === "slack" ? (
        <span>{jt`Slack channel ${(
          <strong>{c.details && c.details.channel}</strong>
        )} will no longer get this alert.`}</span>
      ) : (
        <span>{jt`Channel ${(
          <strong>{c.channel_type}</strong>
        )} will no longer receive this alert.`}</span>
      ),
    );
  }

  render() {
    const { onDeleteAlert } = this.props;

    return (
      <DangerZone
        className={cx(
          AlertModalsS.AlertModalsBorder,
          CS.bordered,
          CS.mt4,
          CS.pt4,
          CS.mb2,
          CS.p3,
          CS.rounded,
          CS.relative,
        )}
      >
        <h3
          className={cx(CS.textError, CS.absolute, CS.top, CS.bgWhite, CS.px1)}
          style={{ marginTop: "-12px" }}
        >{jt`Danger Zone`}</h3>
        <div className={CS.ml1}>
          <h4 className={cx(CS.textBold, CS.mb1)}>{jt`Delete this alert`}</h4>
          <div className={CS.flex}>
            <p
              className={cx(CS.h4, CS.pr2)}
            >{jt`Stop delivery and delete this alert. There's no undo, so be careful.`}</p>
            <ModalWithTrigger
              ref={ref => (this.deleteModal = ref)}
              as={Button}
              triggerClasses={cx(
                ButtonsS.ButtonDanger,
                CS.flexAlignRight,
                CS.flexNoShrink,
                CS.alignSelfEnd,
              )}
              triggerElement={t`Delete this alert`}
            >
              <DeleteModalWithConfirm
                objectType="alert"
                title={t`Delete this alert?`}
                confirmItems={this.getConfirmItems()}
                onClose={() => this.deleteModal.close()}
                onDelete={onDeleteAlert}
              />
            </ModalWithTrigger>
          </div>
        </div>
      </DangerZone>
    );
  }
}
