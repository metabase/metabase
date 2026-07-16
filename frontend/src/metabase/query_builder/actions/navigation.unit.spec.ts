// Pins the QB location-change read seam, the counterpart to url.ts which
// produces the pushes. locationChanged decides between re-running initializeQB
// and dispatching popState based on location.action plus location.state. The
// router migration re-plumbs this read seam, so this locks the current matrix.
import type { Location } from "history";

import { getMainStore } from "__support__/entities-store";
import type { DatasetEditorTab } from "metabase/redux/store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "metabase/redux/store/mocks";
import { createSavedStructuredCard } from "metabase-types/api/mocks/presets";

import * as coreModule from "./core/core";
import * as initializeQBModule from "./core/initializeQB";
import { locationChanged, popState } from "./navigation";
import * as uiModule from "./ui";

const loc = (over: Partial<Location> = {}): Location =>
  // a minimal Location carrying only the fields locationChanged reads
  ({
    pathname: "/question/1",
    search: "",
    hash: "",
    action: "PUSH",
    state: null,
    ...over,
  }) as Location;

const dispatchedAThunk = (dispatch: jest.Mock) =>
  dispatch.mock.calls.some(([action]) => typeof action === "function");

describe("locationChanged", () => {
  let dispatch: jest.Mock;
  let initSpy: jest.SpyInstance;

  beforeEach(() => {
    dispatch = jest.fn();
    initSpy = jest
      .spyOn(initializeQBModule, "initializeQB")
      // initializeQB returns a thunk; this test only needs a sentinel action,
      // so cast the plain action object to the creator's return type.
      .mockReturnValue({ type: "MOCK_INIT" } as unknown as ReturnType<
        typeof initializeQBModule.initializeQB
      >);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does nothing when location and nextLocation are the same reference", () => {
    const location = loc();

    locationChanged(location, location, {})(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("re-initializes QB on an external PUSH to a different pathname", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "PUSH",
      state: null,
    });
    const nextParams = { slug: "2" };

    locationChanged(location, nextLocation, nextParams)(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith(nextLocation, nextParams);
    expect(dispatchedAThunk(dispatch)).toBe(false);
  });

  it("ignores an app-initiated PUSH that carries state", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "PUSH",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("re-initializes QB on an external REPLACE", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "REPLACE",
      state: null,
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(dispatchedAThunk(dispatch)).toBe(false);
  });

  it("ignores an app-initiated REPLACE that carries state", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "REPLACE",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches popState and re-initializes QB on an external POP that changed the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "POP",
      state: null,
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(dispatchedAThunk(dispatch)).toBe(true);
  });

  it("dispatches popState but does not re-initialize QB on an app-initiated POP that changed the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({
      pathname: "/question/2",
      action: "POP",
      state: { card: { id: 2 } },
    });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatchedAThunk(dispatch)).toBe(true);
  });

  it("does nothing on a POP that did not change the url", () => {
    const location = loc({ pathname: "/question/1" });
    const nextLocation = loc({ pathname: "/question/1", action: "POP" });

    locationChanged(location, nextLocation, {})(dispatch);

    expect(initSpy).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// metabase#55162: back/forward navigation into a QB history entry shouldn't re-push a URL.
describe("popState - shouldUpdateUrl (metabase#55162)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs the restored history card without pushing a new url", async () => {
    // The card in history (a model) differs from the one in the store
    // so popState restores and runs it.
    const currentCard = createSavedStructuredCard({ id: 1 });
    const historyCard = createSavedStructuredCard({ id: 2, type: "model" });

    const store = getMainStore({
      qb: createMockQueryBuilderState({ card: currentCard }),
    });

    // Stub only the two action-creators that fire real queries/URL effects
    const setCardAndRunSpy = jest
      .spyOn(coreModule, "setCardAndRun")
      .mockReturnValue(async () => undefined);
    jest
      .spyOn(uiModule, "setQueryBuilderMode")
      .mockReturnValue(async () => undefined);

    // a POP Location whose state carries the history card popState restores
    const location = {
      pathname: "/model/2",
      search: "",
      hash: "",
      action: "POP",
      state: { card: historyCard },
    } as unknown as Location;

    await store.dispatch(popState(location));

    expect(setCardAndRunSpy).toHaveBeenCalledWith(historyCard, {
      shouldUpdateUrl: false,
    });
  });
});

// metabase#55486 / #56775
// A model editor has a Query tab and a Columns tab, and each tab has its own URL.
// Browser back/forward changes the URL so the editor should switch to whichever tab that URL points to.
describe("popState — datasetEditorTab restoration (metabase#55486)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setup = (currentTab: DatasetEditorTab) => {
    const store = getMainStore({
      qb: createMockQueryBuilderState({
        uiControls: createMockQueryBuilderUIControlsState({
          queryBuilderMode: "dataset",
          datasetEditorTab: currentTab,
        }),
      }),
    });
    const setQueryBuilderModeSpy = jest
      .spyOn(uiModule, "setQueryBuilderMode")
      .mockReturnValue(async () => undefined);
    return { store, setQueryBuilderModeSpy };
  };

  const popToTab = (tab: string): Location =>
    // a POP Location whose last path segment selects the editor tab
    ({
      pathname: `/model/1/${tab}`,
      search: "",
      hash: "",
      action: "POP",
      state: null,
    }) as unknown as Location;

  it("restores the dataset editor tab from the location when only the tab changed", async () => {
    const { store, setQueryBuilderModeSpy } = setup("query");

    await store.dispatch(popState(popToTab("metadata")));

    expect(setQueryBuilderModeSpy).toHaveBeenCalledWith(
      "dataset",
      expect.objectContaining({
        datasetEditorTab: "metadata",
        shouldUpdateUrl: false,
      }),
    );
  });

  it("does not switch modes when both the mode and tab already match the location", async () => {
    const { store, setQueryBuilderModeSpy } = setup("metadata");

    await store.dispatch(popState(popToTab("metadata")));

    expect(setQueryBuilderModeSpy).not.toHaveBeenCalled();
  });
});
