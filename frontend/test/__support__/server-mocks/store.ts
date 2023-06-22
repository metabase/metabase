import fetchMock from "fetch-mock";
import { StoreTokenStatus } from "metabase-types/api";

export function setupStoreTokenEndpoints(tokenStatus: StoreTokenStatus) {
  fetchMock.get("path:/api/premium-features/token/status", tokenStatus);
}
