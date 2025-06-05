import { trackSearchRequest } from "metabase/search/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";

// Types for the visualization-compatible endpoint
interface VisualizationContext {
  display: string;
  dimensions: {
    temporal: number[];
    non_temporal: number[];
  };
}

interface VisualizationCompatibleSearchRequest {
  q?: string;
  limit?: number;
  models?: Array<"card" | "dataset" | "metric">;
  include_dashboard_questions?: boolean;
  include_metadata?: boolean;
  visualization_context?: VisualizationContext;
}

export const searchApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/search",
        params,
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
      onQueryStarted: (args, { queryFulfilled }) => {
        if (args.context) {
          const start = Date.now();
          queryFulfilled.then(({ data }) => {
            const duration = Date.now() - start;
            trackSearchRequest(args, data, duration);
          });
        }
      },
    }),
    visualizationCompatibleSearch: builder.mutation<any, VisualizationCompatibleSearchRequest>({
      query: (data) => ({
        method: "POST",
        url: "/api/search/visualization-compatible",
        body: data,
      }),
    }),
  }),
});

export const { useSearchQuery, useVisualizationCompatibleSearchMutation } = searchApi;
