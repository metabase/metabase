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

// A query in flight sets a loading document title and arms a timeout that changes it to "Still Here...".
// These constants seed that in-flight state.
const LOADING_TITLE = "Doing science...";
// the store types timeoutId as string, but setTimeout hands back a number
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

    await store.dispatch(queryErrored(Date.now(), { status: 500 }));

    expect(getDocumentTitle(store.getState())).toBe("");
    expect(clearTimeoutSpy).toHaveBeenCalledWith(FAKE_TIMEOUT_ID);
  });

  it("leaves the loading title untouched when the query was aborted", async () => {
    const store = setupErroredStore();

    await store.dispatch(queryErrored(Date.now(), { name: "AbortError" }));

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

  const controller = new AbortController();
  const abort = jest.spyOn(controller, "abort");
  const state = createMockState({
    entities,
    qb: createMockQueryBuilderState({
      card,
      cancelQueryController: isRunning ? controller : null,
      uiControls: createMockQueryBuilderUIControlsState({ isRunning }),
    }),
  });

  const getState: GetState = () => state;
  // a thunk-running dispatch double: invoke thunks, pass plain actions through
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
      () =>
        // resolved value is unused; cast the empty promise to the run fn's type
        Promise.resolve({}) as unknown as ReturnType<
          typeof apiRunQuestionQuery
        >,
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

describe("loadStartUIControls (metabase#40051)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Deliberately doesn't resolve to keep the query in flight so the loading title isn't cleared
    mockApiRunQuestionQuery.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // the document title comes from a factory function, but in metabase#40051 the factory function wasn't called
  it("sets the document title to the loading message string", () => {
    const store = getMainStore();

    store.dispatch(runQuestionQuery({ shouldUpdateUrl: false }));

    expect(getDocumentTitle(store.getState())).toBe("Doing science...");
  });
});
