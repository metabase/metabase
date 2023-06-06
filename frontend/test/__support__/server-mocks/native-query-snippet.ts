import fetchMock from "fetch-mock";

export function setupNativeQuerySnippetEndpoints() {
  fetchMock.get("path:/api/native-query-snippet", () => []);
}
