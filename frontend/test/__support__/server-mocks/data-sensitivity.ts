import fetchMock from "fetch-mock";

import type {
  ConcreteTableId,
  DataSensitivityDatabaseResult,
  DataSensitivityTableResult,
  DataSensitivityUnavailableError,
  DatabaseId,
} from "metabase-types/api";

export function setupClassifyDataSensitivityDatabaseEndpoint(
  databaseId: DatabaseId,
  response: DataSensitivityDatabaseResult,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/database/${databaseId}`, {
    body: response,
  });
}

export function setupClassifyDataSensitivityDatabaseEndpointError(
  databaseId: DatabaseId,
  error: DataSensitivityUnavailableError,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/database/${databaseId}`, {
    status: 400,
    body: error,
  });
}

export function setupClassifyDataSensitivityTableEndpoint(
  tableId: ConcreteTableId,
  response: DataSensitivityTableResult,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/table/${tableId}`, {
    body: response,
  });
}
