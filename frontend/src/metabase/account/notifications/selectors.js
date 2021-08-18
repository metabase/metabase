import { createSelector } from "reselect";
import Settings from "metabase/lib/settings";

export const getAlerts = state => {
  return state.entities.alerts;
};

export const getPulses = state => {
  return state.entities.pulses;
};

export const getNotifications = createSelector(
  [getAlerts, getPulses],
  (alerts, pulses) => {
    const items = [
      ...Object.values(alerts).map(alert => ({ item: alert, type: "alert" })),
      ...Object.values(pulses).map(pulse => ({ item: pulse, type: "pulse" })),
    ];

    return items.sort((a, b) => b.item.created_at - a.item.created_at);
  },
);

export const getAdminEmail = () => {
  return Settings.get("admin-email");
};
