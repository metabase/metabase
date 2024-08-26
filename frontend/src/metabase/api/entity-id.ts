import { Api } from "./api";

export const entityIdApi = Api.injectEndpoints({
  endpoints: builder => ({
    translateEntityId: builder.query<
      Record<string, unknown>,
      Record<string, string[]>
    >({
      query: (body: Record<string, string[]>) => ({
        method: "POST",
        url: `/api/util/entity_id`,
        body: {
          entity_ids: body,
        },
      }),
    }),
  }),
});

export const { useTranslateEntityIdQuery } = entityIdApi;
