import {
  subscriptionApi,
  useGetSubscriptionQuery,
  useListSubscriptionsQuery,
} from "metabase/api";
import { getCollectionType } from "metabase/entities/collections/utils";

import { createEntity, entityCompatibleQuery } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 */
export const Pulses = createEntity({
  name: "pulses",
  nameOne: "pulse",
  path: "/api/pulse",

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListSubscriptionsQuery,
  }),

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

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetSubscriptionQuery(id, options);
};
