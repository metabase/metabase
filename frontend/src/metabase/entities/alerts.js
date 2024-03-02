import { t } from "ttag";

import { createEntity, undo } from "metabase/lib/entities";
import { addUndo } from "metabase/redux/undo";
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
        undo(opts, t`alert`, archived ? t`deleted` : t`restored`),
      );
    },

    unsubscribe:
      ({ id }) =>
      async dispatch => {
        await AlertApi.unsubscribe({ id });
        dispatch(addUndo({ message: t`Successfully unsubscribed` }));
        dispatch({ type: UNSUBSCRIBE, payload: { id } });
        dispatch({ type: Alerts.actionTypes.INVALIDATE_LISTS_ACTION });
      },

    setChannels: ({ id }, channels, opts) => {
      return Alerts.actions.update(
        { id },
        { channels },
        undo(opts, t`alert`, t`updated`),
      );
    },
  },
});

export default Alerts;
