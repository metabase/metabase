import fetchMock from "fetch-mock";
import { Settings } from "metabase-types/api";

export function setupPropertiesEndpoints(settings: Settings) {
  fetchMock.get("path:/api/session/properties", settings);
}
