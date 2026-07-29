import fetchMock from "fetch-mock";

export function setupApplyAdvancedConfigEndpoint() {
  fetchMock.post("path:/api/ee/advanced-config", 204);
}
