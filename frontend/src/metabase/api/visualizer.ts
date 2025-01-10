import type {
  Card,
  DatasetColumn,
  VisualizationDisplay,
} from "metabase-types/api";

import { Api } from "./api";

type VisualizerEndpointCard = Card & {
  compatible: boolean | null;
};

export type VisualizerSearchParams = {
  search?: string;
  display: VisualizationDisplay | null;
  "dataset-columns": DatasetColumn[];
};

export const visualizerApi = Api.injectEndpoints({
  endpoints: builder => ({
    visualizerSearch: builder.query<
      VisualizerEndpointCard[],
      VisualizerSearchParams
    >({
      query: params => ({
        method: "POST",
        url: "/api/visualizer",
        params,
      }),
    }),
  }),
});

export const { useVisualizerSearchQuery } = visualizerApi;
