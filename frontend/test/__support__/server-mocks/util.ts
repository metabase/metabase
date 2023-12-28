import fetchMock from "fetch-mock";

export function setupPasswordCheckEndpoint() {
  fetchMock.post("path:/api/util/password_check", 204);
}
