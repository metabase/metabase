import fetchMock from "fetch-mock";

export function setupErrorSetupEndpoints() {
  fetchMock.post("path:/api/setup", 400);
}

export function setupForTokenCheckEndpoint(response: { valid: boolean }) {
  fetchMock.put(
    "path:/api/setting/premium-embedding-token",
    response.valid ? 204 : 400,
  );
}
