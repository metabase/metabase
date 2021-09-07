import { t } from "ttag";
import { createEntity, undo } from "metabase/lib/entities";

const Alerts = createEntity({
  name: "alerts",
  nameOne: "alert",
  path: "/api/alert",

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Alerts.actions.update(
        { id },
        { archived },
        undo(opts, t`alert`, archived ? t`archived` : t`unarchived`),
      );
    },

    unsubscribe: ({ id, channels }, user, opts) => {
      const newChannels = channels.map(channel => ({
        ...channel,
        recipients: channel.recipients.filter(
          recipient => recipient.id !== user.id,
        ),
      }));

      return Alerts.actions.update(
        { id },
        { channels: newChannels },
        undo(opts, "", t`unsubscribed`),
      );
    },
  },
});

export default Alerts;
