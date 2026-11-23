import { defaultSerializeQueryArgs } from "@reduxjs/toolkit/query/react";
import { match } from "ts-pattern";
import _ from "underscore";

import type {
  GoalSourceResults,
  GoalSourceResultsRequest,
} from "metabase-types/api";

import { Api } from "./api";

type SignedInGoalSourceResultsRequest = Extract<
  GoalSourceResultsRequest,
  { type: "signed-in" }
>;

type GoalSourceResultsQuery =
  | {
      method: "GET";
      url: string;
    }
  | {
      method: "POST";
      url: string;
      body: Pick<
        SignedInGoalSourceResultsRequest,
        "sources" | "dashboard_id" | "ignore_cache"
      >;
    };

export const dynamicGoalApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getGoalSourceResults: builder.query<
      GoalSourceResults,
      GoalSourceResultsRequest
    >({
      query: getGoalSourceResultsQuery,
      // a refresh that ignores the cache updates the results a chart already reads
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: _.omit(queryArgs, "ignore_cache"),
        }),
    }),
  }),
});

export const { useGetGoalSourceResultsQuery } = dynamicGoalApi;

function getGoalSourceResultsQuery(
  request: GoalSourceResultsRequest,
): GoalSourceResultsQuery {
  return (
    match(request)
      .returnType<GoalSourceResultsQuery>()
      .with(
        { type: "signed-in" },
        ({ sources, dashboard_id, ignore_cache }) => ({
          method: "POST",
          url: "/api/dynamic-goal/values",
          body: { sources, dashboard_id, ignore_cache },
        }),
      )
      .with({ type: "public-card" }, ({ uuid }) => ({
        method: "GET",
        url: `/api/public/card/${uuid}/goal-values`,
      }))
      .with({ type: "public-dashcard" }, ({ uuid, dashcardId, cardId }) => ({
        method: "GET",
        url: `/api/public/dashboard/${uuid}/dashcard/${dashcardId}/card/${cardId}/goal-values`,
      }))
      .with({ type: "public-document-card" }, ({ uuid, cardId }) => ({
        method: "GET",
        url: `/api/public/document/${uuid}/card/${cardId}/goal-values`,
      }))
      // `/api/embed` is rewritten to `/api/preview_embed` in an embed preview
      .with({ type: "embed-card" }, ({ token }) => ({
        method: "GET",
        url: `/api/embed/card/${token}/goal-values`,
      }))
      .with({ type: "embed-dashcard" }, ({ token, dashcardId, cardId }) => ({
        method: "GET",
        url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/goal-values`,
      }))
      .exhaustive()
  );
}
