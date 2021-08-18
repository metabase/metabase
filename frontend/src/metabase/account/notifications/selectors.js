import { createSelector } from "reselect";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import { getUser } from "metabase/selectors/user";

export const getAlerts = state => {
  return state.entities.alerts;
};

export const getPulses = state => {
  return state.entities.pulses;
};

export const getUserAlerts = createSelector(
  [getAlerts, getUser],
  (alerts, user) => {
    return _.pick(
      alerts,
      alert => isCreator(alert, user) || isSubscribed(alert, user),
    );
  },
);

export const getUserPulses = createSelector(
  [getPulses, getUser],
  (pulses, user) => {
    return _.pick(
      pulses,
      pulse => isCreator(pulse, user) || isSubscribed(pulse, user),
    );
  },
);

export const getUserNotifications = createSelector(
  [getUserAlerts, getUserPulses],
  (alerts, pulses) => {
    const items = [
      ..._.values(alerts).map(alert => ({ item: alert, type: "alert" })),
      ..._.values(pulses).map(pulse => ({ item: pulse, type: "pulse" })),
    ];

    return items.sort((a, b) => b.item.created_at - a.item.created_at);
  },
);

export const getAdminEmail = () => {
  return Settings.get("admin-email");
};

const isCreator = (item, user) => {
  return item.creator.id === user.id;
};

const isSubscribed = (item, user) => {
  return item.channels.some(channel =>
    channel.recipients.some(recipient => recipient.id === user.id),
  );
};
