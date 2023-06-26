import PropTypes from "prop-types";
import { t, jt, ngettext, msgid } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";

function getConfirmItems(pulse) {
  return pulse.channels.map((c, index) =>
    c.channel_type === "email" ? (
      <span key={index}>
        {jt`This dashboard will no longer be emailed to ${(
          <strong key="msg">
            {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
              c.recipients.length,
            )}
          </strong>
        )} ${(<strong key="type">{c.schedule_type}</strong>)}`}
        .
      </span>
    ) : c.channel_type === "slack" ? (
      <span key={index}>
        {jt`Slack channel ${(
          <strong key="msg">{c.details && c.details.channel}</strong>
        )} will no longer get this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ) : (
      <span key={index}>
        {jt`Channel ${(
          <strong key="msg">{c.channel_type}</strong>
        )} will no longer receive this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ),
  );
}

function DeleteSubscriptionAction({ pulse, handleArchive }) {
  return pulse.id != null && !pulse.archived ? (
    <div className="border-top pt1 pb3 flex justify-end">
      <ModalWithTrigger
        triggerClasses="Button Button--borderless text-light text-error-hover flex-align-right flex-no-shrink"
        triggerElement={t`Delete this subscription`}
      >
        {({ onClose }) => (
          <DeleteModalWithConfirm
            objectType="pulse"
            title={t`Delete this subscription to ${pulse.name}?`}
            buttonText={t`Delete`}
            confirmItems={getConfirmItems(pulse)}
            onClose={onClose}
            onDelete={handleArchive}
          />
        )}
      </ModalWithTrigger>
    </div>
  ) : null;
}

DeleteSubscriptionAction.propTypes = {
  pulse: PropTypes.object.isRequired,
  handleArchive: PropTypes.func.isRequired,
};

export default DeleteSubscriptionAction;
