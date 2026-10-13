import fetchMock, { type CallLog, type UserRouteConfig } from "fetch-mock";

import type {
  CardQueryMetadata,
  Dataset,
  ParameterValues,
} from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupAdhocQueryEndpoint(
  response:
    | Dataset
    | Response
    | ((call: CallLog) => Dataset | Response | Promise<Dataset | Response>),
  options?: UserRouteConfig,
) {
  fetchMock.post("path:/api/dataset", response, options);
}

export function setupAdhocQueryMetadataEndpoint(metadata: CardQueryMetadata) {
  fetchMock.post(`path:/api/dataset/query_metadata`, metadata, {
    name: "dataset-query-metadata",
  });
}

export function setupParameterValuesEndpoints(response: ParameterValues) {
  fetchMock.post("path:/api/dataset/parameter/values", response);
}

export function setupErrorParameterValuesEndpoints() {
  fetchMock.post("path:/api/dataset/parameter/values", 500);
}

export function setupParameterSearchValuesEndpoint(
  query: string,
  response: ParameterValues,
) {
  fetchMock.post({
    url: `path:/api/dataset/parameter/search/${encodeURIComponent(query)}`,
    response,
    name: `dataset-parameter-search-${query}`,
  });
}

export function setupCardDataset(
  args: {
    dataset?: MockDatasetOpts;
    status?: number;
  } = {},
) {
  const { dataset, status = 200 } = args;

  fetchMock.post(
    "path:/api/dataset",
    new Response(JSON.stringify(createMockDataset(dataset)), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    {
      name: "dataset-post",
    },
  );
}
