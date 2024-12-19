import cx from "classnames";
import { useMemo, useRef } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import { useListChannelsQuery } from "metabase/api/channel";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { channelIsEnabled } from "metabase/lib/alert";
import type { Alert } from "metabase-types/api";

import AlertModalsS from "./AlertModals.module.css";
import { DangerZone } from "./AlertModals.styled";

export const DeleteAlertSection = ({
  onDeleteAlert,
  alert,
}: {
  onDeleteAlert: () => void;
  alert: Alert;
}) => {
  const deleteModal = useRef<any>(null);

  const { data: notificationChannels = [] } = useListChannelsQuery();

  const getConfirmItems = useMemo(() => {
    // same as in PulseEdit but with some changes to copy
    return alert.channels.filter(channelIsEnabled).map((channel, index) => {
      switch (channel.channel_type) {
        case "email": {
          return (
            <span
              key={`${channel.channel_type}-${index}`}
            >{jt`This alert will no longer be emailed to ${(
              <strong key="bold">
                {(n => ngettext(msgid`${n} address`, `${n} addresses`, n || 0))(
                  channel.recipients?.length,
                )}
              </strong>
            )}.`}</span>
          );
        }
        case "slack": {
          return (
            <span>{jt`Slack channel ${(
              <strong key="bold">
                {channel.details && channel.details.channel}
              </strong>
            )} will no longer get this alert.`}</span>
          );
        }
        case "http": {
          const notification = notificationChannels.find(
            notificationChannels =>
              notificationChannels.id === channel.channel_id,
          );
          return (
            <span>{jt`Channel ${(
              <strong key="bold">
                {notification?.name || channel.channel_type}
              </strong>
            )} will no longer receive this alert.`}</span>
          );
        }
        default: {
          return (
            <span>{jt`Channel ${(
              <strong key="bold">{channel.channel_type}</strong>
            )} will no longer receive this alert.`}</span>
          );
        }
      }
    });
  }, [notificationChannels, alert.channels]);

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
            ref={deleteModal}
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
              confirmItems={getConfirmItems}
              onClose={() => deleteModal.current?.close()}
              onDelete={onDeleteAlert}
            />
          </ModalWithTrigger>
        </div>
      </div>
    </DangerZone>
  );
};
