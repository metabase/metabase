import fetchMock from "fetch-mock";

import type { TableId, TablePublishingInfo } from "metabase-types/api";
import {
  createMockBulkTableSelectionInfo,
  createMockPublishTablesResponse,
} from "metabase-types/api/mocks";

const TABLE_PUBLISHING_INFO_ROUTE = "table-publishing-info";

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

export function setupTablePublishingInfoEndpoint(
  tableId: TableId,
  response: TablePublishingInfo | null,
) {
  fetchMock.removeRoute(TABLE_PUBLISHING_INFO_ROUTE);
  fetchMock.get(
    `path:/api/ee/data-studio/table/${tableId}/publishing-info`,
    response ?? { status: 204 },
    { name: TABLE_PUBLISHING_INFO_ROUTE },
  );
}

export function setupTablePublishingInfoEndpointError(tableId: TableId) {
  fetchMock.removeRoute(TABLE_PUBLISHING_INFO_ROUTE);
  fetchMock.get(
    `path:/api/ee/data-studio/table/${tableId}/publishing-info`,
    { status: 500 },
    { name: TABLE_PUBLISHING_INFO_ROUTE },
  );
}
