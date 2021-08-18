import { createEntity } from "metabase/lib/entities";
import { AlertApi } from "metabase/services";

export const UNSUBSCRIBE = "metabase/entities/alerts/UNSUBSCRIBE";

const Alerts = createEntity({
  name: "alerts",
  path: "/api/alert",

  actionTypes: {
    UNSUBSCRIBE,
  },

  objectActions: {
    unsubscribe: async ({ id }) => {
      await AlertApi.unsubscribe({ id });
      return { type: UNSUBSCRIBE };
    },
  },
});

export default Alerts;
