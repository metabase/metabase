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
        undo(opts, "alert", archived ? "archived" : "unarchived"),
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
        undo(opts, "alert", "unsubscribed"),
      );
    },
  },
});

export default Alerts;
