import type {
  Field,
  RecentItem,
  VisualizationDisplay,
} from "metabase-types/api";

import { Api } from "./api";
import { provideActivityItemListTags } from "./tags";

export interface VisualizerCompatibleRecentsRequest {
  current_display: VisualizationDisplay | null;
  current_columns: Field[];
  current_settings: Record<string, any>;
}

export interface VisualizerCompatibleRecentsResponse {
  recents: RecentItem[];
  total_count: number;
  filtered_from: number;
}

export const visualizerApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getVisualizerCompatibleRecents: builder.mutation<
      VisualizerCompatibleRecentsResponse,
      VisualizerCompatibleRecentsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/visualizer/compatible-recents",
        body,
      }),
      invalidatesTags: (result, error) =>
        error ? [] : provideActivityItemListTags(result?.recents ?? []),
    }),
  }),
});

export const { useGetVisualizerCompatibleRecentsMutation } = visualizerApi;
