import { match } from "ts-pattern";

import type {
  CardId,
  DashCardId,
  DashboardId,
  ReferencedEntitiesResults,
  ReferencedEntity,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

import { Api } from "./api";
import { idTag, tag } from "./tags";

export type GetGoalValuesRequest =
  | {
      type: "sources";
      sources: ReferencedEntity[];
      dashboardId?: DashboardId;
    }
  | { type: "public-card"; uuid: EntityUuid }
  | { type: "public-dashcard"; uuid: EntityUuid; dashcardId: DashCardId }
  | { type: "public-document-card"; uuid: EntityUuid; cardId: CardId }
  | { type: "embed-card"; token: EntityToken }
  | { type: "embed-dashcard"; token: EntityToken; dashcardId: DashCardId };

/**
 * A goal that can't load fails softly, so its request must not trigger
 * app-wide error handling such as the login redirect.
 */
export const dynamicGoalApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getGoalValues: builder.query<
      ReferencedEntitiesResults,
      GetGoalValuesRequest
    >({
      query: (request) =>
        match(request)
          .returnType<{
            method: "GET" | "POST";
            url: string;
            body?: unknown;
            noEvent: true;
          }>()
          .with({ type: "sources" }, ({ sources, dashboardId }) => ({
            method: "POST",
            noEvent: true,
            url: "/api/dynamic-goal/values",
            body: { sources, dashboard_id: dashboardId },
          }))
          .with({ type: "public-card" }, ({ uuid }) => ({
            method: "GET",
            noEvent: true,
            url: `/api/public/card/${uuid}/goal-values`,
          }))
          .with({ type: "public-dashcard" }, ({ uuid, dashcardId }) => ({
            method: "GET",
            noEvent: true,
            url: `/api/public/dashboard/${uuid}/dashcard/${dashcardId}/goal-values`,
          }))
          .with({ type: "public-document-card" }, ({ uuid, cardId }) => ({
            method: "GET",
            noEvent: true,
            url: `/api/public/document/${uuid}/card/${cardId}/goal-values`,
          }))
          // `/api/embed` is rewritten to `/api/preview_embed` by the request
          // middleware when running inside an embed preview.
          .with({ type: "embed-card" }, ({ token }) => ({
            method: "GET",
            noEvent: true,
            url: `/api/embed/card/${token}/goal-values`,
          }))
          .with({ type: "embed-dashcard" }, ({ token, dashcardId }) => ({
            method: "GET",
            noEvent: true,
            url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/goal-values`,
          }))
          .exhaustive(),
      providesTags: (results) => [
        tag("dynamic-goal-values"),
        ...Object.keys(results?.card ?? {}).map((id) =>
          idTag("card", Number(id)),
        ),
        ...Object.keys(results?.measure ?? {}).map((id) =>
          idTag("measure", Number(id)),
        ),
      ],
    }),
  }),
});

export const { useGetGoalValuesQuery } = dynamicGoalApi;
