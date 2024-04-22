import { t } from "ttag";

import { alertApi } from "metabase/api";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import { addUndo } from "metabase/redux/undo";

export const UNSUBSCRIBE = "metabase/entities/alerts/unsubscribe";

/**
 * @deprecated use "metabase/api" instead
 */
const Alerts = createEntity({
  name: "alerts",
  nameOne: "alert",
  path: "/api/alert",

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        alertApi.endpoints.listAlerts,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        alertApi.endpoints.listAlerts,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        alertApi.endpoints.createAlert,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        alertApi.endpoints.updateAlert,
      ),
    delete: () => {
      throw new TypeError("Alerts.api.delete is not supported");
    },
  },

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
        await entityCompatibleQuery(
          id,
          dispatch,
          alertApi.endpoints.deleteAlertSubscription,
        );
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
