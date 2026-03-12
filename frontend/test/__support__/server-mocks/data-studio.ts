import fetchMock from "fetch-mock";

import {
  createMockBulkTableSelectionInfo,
  createMockPublishTablesResponse,
} from "metabase-types/api/mocks";

export function setupTableSelectionInfoEndpoint(
  response = createMockBulkTableSelectionInfo(),
) {
  fetchMock.post("path:/api/data-studio/table/selection", response);
}

export function setupPublishTablesEndpoint(
  response = createMockPublishTablesResponse(),
) {
  fetchMock.post("path:/api/ee/data-studio/table/publish-tables", response);
}

export function setupPublishTablesEndpointError() {
  fetchMock.post("path:/api/ee/data-studio/table/publish-tables", {
    status: 500,
  });
}

export function setupUnpublishTablesEndpoint() {
  fetchMock.post("path:/api/ee/data-studio/table/unpublish-tables", {
    status: 204,
  });
}

export function setupUnpublishTablesEndpointError() {
  fetchMock.post("path:/api/ee/data-studio/table/unpublish-tables", {
    status: 500,
  });
}
