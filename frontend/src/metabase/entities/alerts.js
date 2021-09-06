import { t } from "ttag";
import { createEntity, undo } from "metabase/lib/entities";
import { AlertApi } from "metabase/services";

export const UNSUBSCRIBE = "metabase/entities/alerts/unsubscribe";

const Alerts = createEntity({
  name: "alerts",
  nameOne: "alert",
  path: "/api/alert",

  actionTypes: {
    UNSUBSCRIBE,
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Alerts.actions.update(
        { id },
        { archived },
        undo(opts, t`alert`, archived ? t`archived` : t`unarchived`),
      );
    },

    unsubscribe: async ({ id }) => {
      await AlertApi.unsubscribe({ id });
      return { type: UNSUBSCRIBE };
    },
  },
});

export default Alerts;
