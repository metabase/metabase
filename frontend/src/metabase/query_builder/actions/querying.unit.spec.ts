// Pins the document-title reset on query failure (metabase#49270). While a
// query runs, loadStartUIControls sets the document title to a loading message
// and arms a timeout that escalates it to "Still Here...". When the query
// errors, queryErrored must clear that timeout and reset the document title to
// "" so the tab no longer claims loading is in progress. The bug was that the
// error path left the loading title (and its timeout) in place.
import { getMainStore } from "__support__/entities-store";
import { createMockQueryBuilderState } from "metabase/redux/store/mocks";

import { getDocumentTitle } from "../selectors";

import { queryErrored } from "./querying";

const LOADING_TITLE = "Doing science...";
const FAKE_TIMEOUT_ID = 1234 as unknown as string;

function setupStore() {
  return getMainStore({
    qb: createMockQueryBuilderState({
      loadingControls: {
        showLoadCompleteFavicon: false,
        documentTitle: LOADING_TITLE,
        timeoutId: FAKE_TIMEOUT_ID,
      },
    }),
  });
}

describe("queryErrored (metabase#49270)", () => {
  let clearTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("resets the document title and clears the loading timeout on a real error", async () => {
    const store = setupStore();

    await store.dispatch(queryErrored(Date.now(), { status: 500 }) as any);

    expect(getDocumentTitle(store.getState())).toBe("");
    expect(clearTimeoutSpy).toHaveBeenCalledWith(FAKE_TIMEOUT_ID);
  });

  it("leaves the loading title untouched when the query was aborted", async () => {
    const store = setupStore();

    await store.dispatch(
      queryErrored(Date.now(), { name: "AbortError" }) as any,
    );

    expect(getDocumentTitle(store.getState())).toBe(LOADING_TITLE);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });
});
