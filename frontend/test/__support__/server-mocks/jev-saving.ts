import fetchMock from "fetch-mock";

import type { JevSaveCheck } from "metabase/api/jev-saving";

const UNAVAILABLE: JevSaveCheck = {
  status: "unavailable",
  duplicate: null,
  collection: null,
  elapsed_ms: 0,
};

/** Mocks the Jev save-time check the SaveQuestionModal fires on open. */
export function setupJevSaveCheckEndpoint(
  response: JevSaveCheck = UNAVAILABLE,
) {
  fetchMock.post("path:/api/jev/saving/check", response);
}
