import { getMainStore } from "__support__/entities-store";
import { createMockEntitiesState } from "__support__/store";
import { runQuestionQuery as apiRunQuestionQuery } from "metabase/querying/run-query";
import type { Dispatch, GetState } from "metabase/redux/store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import {
  createSampleDatabase,
  createSavedNativeCard,
} from "metabase-types/api/mocks/presets";

import { getDocumentTitle } from "../selectors";

import {
  queryErrored,
  runOrCancelQuestionOrSelectedQuery,
  runQuestionQuery,
} from "./querying";

jest.mock("metabase/querying/run-query", () => ({
  runQuestionQuery: jest.fn(() => Promise.resolve({})),
}));

jest.mock("./url", () => ({
  updateUrl: jest.fn(() => ({ type: "MOCK_UPDATE_URL" })),
}));

const mockApiRunQuestionQuery = jest.mocked(apiRunQuestionQuery);

// Pins the document-title reset on query failure (metabase#49270). While a
// query runs, loadStartUIControls sets the document title to a loading message
// and arms a timeout that escalates it to "Still Here...". When the query
// errors, queryErrored must clear that timeout and reset the document title to
// "" so the tab no longer claims loading is in progress. The bug was that the
// error path left the loading title (and its timeout) in place.
const LOADING_TITLE = "Doing science...";
const FAKE_TIMEOUT_ID = 1234 as unknown as string;

function setupErroredStore() {
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
    const store = setupErroredStore();

    await store.dispatch(queryErrored(Date.now(), { status: 500 }) as any);

    expect(getDocumentTitle(store.getState())).toBe("");
    expect(clearTimeoutSpy).toHaveBeenCalledWith(FAKE_TIMEOUT_ID);
  });

  it("leaves the loading title untouched when the query was aborted", async () => {
    const store = setupErroredStore();

    await store.dispatch(
      queryErrored(Date.now(), { name: "AbortError" }) as any,
    );

    expect(getDocumentTitle(store.getState())).toBe(LOADING_TITLE);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });
});

type SetupOpts = {
  isRunning: boolean;
};

function setupRunOrCancel({ isRunning }: SetupOpts) {
  const card = createSavedNativeCard();
  const entities = createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [card],
  });

  const abort = jest.fn();
  const state = createMockState({
    entities,
    qb: createMockQueryBuilderState({
      card,
      cancelQueryController: isRunning ? ({ abort } as AbortController) : null,
      uiControls: createMockQueryBuilderUIControlsState({ isRunning }),
    }),
  });

  const getState: GetState = () => state;
  const dispatch: Dispatch = ((action: unknown) =>
    typeof action === "function"
      ? action(dispatch, getState)
      : action) as Dispatch;

  return { dispatch, getState, abort };
}

describe("runOrCancelQuestionOrSelectedQuery (metabase#59356)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiRunQuestionQuery.mockImplementation(
      () => Promise.resolve({}) as any,
    );
  });

  it("runs the query when nothing is running", async () => {
    const { dispatch, getState } = setupRunOrCancel({ isRunning: false });

    await runOrCancelQuestionOrSelectedQuery()(dispatch, getState);

    expect(mockApiRunQuestionQuery).toHaveBeenCalledTimes(1);
  });

  it("cancels a running query without starting a new one", async () => {
    const { dispatch, getState, abort } = setupRunOrCancel({ isRunning: true });

    await runOrCancelQuestionOrSelectedQuery()(dispatch, getState);

    expect(abort).toHaveBeenCalledTimes(1);
    expect(mockApiRunQuestionQuery).not.toHaveBeenCalled();
  });
});

// Pins the loading document title (metabase#40051). When a query starts,
// loadStartUIControls resolves the white-labeled loading message *factory* and
// must call it, storing the resulting string ("Doing science...") as the
// document title. The bug put the factory function itself into the title, so
// the tab showed stringified JS code instead of the loading message.
describe("loadStartUIControls (metabase#40051)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Keep the query "in flight" so we can observe the loading title without
    // the completion path clearing it.
    mockApiRunQuestionQuery.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("sets the document title to the loading message string, not the factory", () => {
    const store = getMainStore();

    store.dispatch(
      runQuestionQuery({
        shouldUpdateUrl: false,
        overrideWithQuestion: {} as never,
      }) as never,
    );

    expect(getDocumentTitle(store.getState())).toBe("Doing science...");
  });
});
