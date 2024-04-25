import { t } from "ttag";

import { subscriptionApi } from "metabase/api";
import { getCollectionType } from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import {
  createEntity,
  undo,
  entityCompatibleQuery,
} from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";

export const UNSUBSCRIBE = "metabase/entities/pulses/unsubscribe";

/**
 * @deprecated use "metabase/api" instead
 */
const Pulses = createEntity({
  name: "pulses",
  nameOne: "pulse",
  path: "/api/pulse",

  actionTypes: {
    UNSUBSCRIBE,
  },

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        subscriptionApi.endpoints.listSubscriptions,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        subscriptionApi.endpoints.getSubscription,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        subscriptionApi.endpoints.createSubscription,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        subscriptionApi.endpoints.updateSubscription,
      ),
    delete: () => {
      throw new TypeError("Pulses.api.delete is not supported");
    },
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Pulses.actions.update(
        { id },
        { archived },
        undo(opts, t`subscription`, archived ? t`deleted` : t`restored`),
      );
    },

    unsubscribe:
      ({ id }) =>
      async dispatch => {
        await entityCompatibleQuery(
          id,
          dispatch,
          subscriptionApi.endpoints.unsubscribe,
        );
        dispatch(addUndo({ message: t`Successfully unsubscribed` }));
        dispatch({ type: UNSUBSCRIBE, payload: { id } });
        dispatch({ type: Pulses.actionTypes.INVALIDATE_LISTS_ACTION });
      },
  },

  objectSelectors: {
    getName: pulse => pulse && pulse.name,
    getUrl: pulse => pulse && Urls.pulse(pulse.id),
    getIcon: pulse => ({ name: "pulse" }),
    getColor: pulse => color("pulse"),
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Pulses;
