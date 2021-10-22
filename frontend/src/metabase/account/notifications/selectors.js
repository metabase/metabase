import { createSelector } from "reselect";

import { parseTimestamp } from "metabase/lib/time";

export const getAlertId = ({ params: { alertId } }) => {
  return parseInt(alertId);
};

export const getPulseId = ({ params: { pulseId } }) => {
  return parseInt(pulseId);
};

export const getNotifications = createSelector(
  [({ alerts }) => alerts, ({ pulses }) => pulses],
  (alerts, pulses) => {
    const items = [
      ...alerts.map(alert => ({
        item: alert,
        type: "alert",
      })),
      ...pulses.map(pulse => ({
        item: pulse,
        type: "pulse",
      })),
    ];

    return items.sort(
      (a, b) =>
        parseTimestamp(b.item.created_at).unix() -
        parseTimestamp(a.item.created_at).unix(),
    );
  },
);
