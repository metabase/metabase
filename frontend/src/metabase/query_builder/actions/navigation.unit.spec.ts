// Pins the QB location-change read seam, the counterpart to url.ts which
// produces the pushes. locationChanged decides between re-running initializeQB
// and dispatching popState based on location.action plus location.state. The
// router migration re-plumbs this read seam, so this locks the current matrix.
import type { Location } from "history";

import * as queryBuilderReduxModule from "metabase/redux/query-builder";
import * as routingModule from "metabase/selectors/routing";

import * as selectorsModule from "../selectors";
import * as typedUtilsModule from "../typed-utils";

import * as coreModule from "./core/core";
import * as initializeQBModule from "./core/initializeQB";
import { locationChanged, popState } from "./navigation";
import * as queryingModule from "./querying";
import * as stateModule from "./state";
import * as uiModule from "./ui";

const loc = (over: Partial<Location> = {}): Location =>
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
      .mockReturnValue({ type: "MOCK_INIT" } as any);
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

// Witness for metabase#55162: back/forward navigation into a QB history entry
// must NOT re-push a URL. popState runs the card from location.state with
// setCardAndRun; if that call passes shouldUpdateUrl:true, running the card
// pushes a fresh history entry, corrupting the back/forward stack. The fix hard
// -codes shouldUpdateUrl:false regardless of card type; the bug computed it from
// `card.type === "model"`, so model cards leaked a true value.
describe("popState — shouldUpdateUrl", () => {
  let dispatch: jest.Mock;
  let setCardAndRunSpy: jest.SpyInstance;

  const runPopStateWithCard = async (card: any) => {
    const location = {
      pathname: "/model/1",
      search: "",
      hash: "",
      action: "POP",
      state: { card },
    } as unknown as Location;

    await popState(location)(dispatch, () => ({}) as any);
  };

  beforeEach(() => {
    dispatch = jest.fn((action) => action);

    setCardAndRunSpy = jest
      .spyOn(coreModule, "setCardAndRun")
      .mockReturnValue({ type: "MOCK_SET_CARD_AND_RUN" } as any);

    // Neutralize every other action/selector popState touches so the test
    // isolates the setCardAndRun options at the mutation site.
    jest
      .spyOn(queryingModule, "cancelQuery")
      .mockReturnValue({ type: "MOCK_CANCEL" } as any);
    jest.spyOn(selectorsModule, "getZoomedObjectId").mockReturnValue(null);
    // current card differs from the one in history, so popState runs it
    jest.spyOn(selectorsModule, "getCard").mockReturnValue({ id: -1 } as any);
    jest.spyOn(selectorsModule, "getQueryBuilderMode").mockReturnValue("view");
    jest.spyOn(selectorsModule, "getDatasetEditorTab").mockReturnValue("query");
    jest.spyOn(routingModule, "getLocation").mockReturnValue({} as any);
    jest
      .spyOn(typedUtilsModule, "getQueryBuilderModeFromLocation")
      .mockReturnValue({
        queryBuilderMode: "view",
        datasetEditorTab: "query",
      } as any);
    jest
      .spyOn(stateModule, "setCurrentState")
      .mockReturnValue({ type: "MOCK_SET_CURRENT_STATE" } as any);
    jest
      .spyOn(uiModule, "setQueryBuilderMode")
      .mockReturnValue({ type: "MOCK_SET_QB_MODE" } as any);
    jest
      .spyOn(queryBuilderReduxModule, "resetUIControls")
      .mockReturnValue({ type: "MOCK_RESET_UI" } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs a model card without updating the url (shouldUpdateUrl:false)", async () => {
    await runPopStateWithCard({
      type: "model",
      dataset_query: { database: 1 },
    });

    expect(setCardAndRunSpy).toHaveBeenCalledWith(expect.anything(), {
      shouldUpdateUrl: false,
    });
  });

  it("runs a question card without updating the url (shouldUpdateUrl:false)", async () => {
    await runPopStateWithCard({
      type: "question",
      dataset_query: { database: 1 },
    });

    expect(setCardAndRunSpy).toHaveBeenCalledWith(expect.anything(), {
      shouldUpdateUrl: false,
    });
  });
});

// Witness for metabase#55486 / metabase#56775: browser back/forward inside a
// model's editor must restore the dataset editor tab (Query ↔ Columns), not just
// the query-builder mode. popState reads datasetEditorTab from the location and,
// when the current tab differs, dispatches setQueryBuilderMode carrying that tab
// (with shouldUpdateUrl:false). The bug only compared queryBuilderMode, so a
// back/forward step that changed only the tab — mode stayed "dataset" — never
// re-dispatched, leaving the wrong editor tab showing.
describe("popState — datasetEditorTab restoration", () => {
  let dispatch: jest.Mock;
  let setQueryBuilderModeSpy: jest.SpyInstance;

  const runPopState = ({
    currentTab,
    locationMode,
    locationTab,
  }: {
    currentTab: string;
    locationMode: string;
    locationTab: string;
  }) => {
    jest
      .spyOn(selectorsModule, "getDatasetEditorTab")
      .mockReturnValue(currentTab as any);
    jest
      .spyOn(typedUtilsModule, "getQueryBuilderModeFromLocation")
      .mockReturnValue({
        queryBuilderMode: locationMode,
        datasetEditorTab: locationTab,
      } as any);

    // No location.state.card, so the setCardAndRun branch is skipped and the
    // test isolates the queryBuilderMode/datasetEditorTab restoration branch.
    const location = {
      pathname: "/model/1/metadata",
      search: "",
      hash: "",
      action: "POP",
      state: null,
    } as unknown as Location;

    return popState(location)(dispatch, () => ({}) as any);
  };

  beforeEach(() => {
    dispatch = jest.fn((action) => action);

    setQueryBuilderModeSpy = jest
      .spyOn(uiModule, "setQueryBuilderMode")
      .mockReturnValue({ type: "MOCK_SET_QB_MODE" } as any);

    // Neutralize everything else popState touches; mode-from-state is "dataset"
    // so only the editor tab varies between state and location.
    jest
      .spyOn(queryingModule, "cancelQuery")
      .mockReturnValue({ type: "MOCK_CANCEL" } as any);
    jest.spyOn(selectorsModule, "getZoomedObjectId").mockReturnValue(null);
    jest.spyOn(selectorsModule, "getCard").mockReturnValue({ id: -1 } as any);
    jest
      .spyOn(selectorsModule, "getQueryBuilderMode")
      .mockReturnValue("dataset");
    jest.spyOn(routingModule, "getLocation").mockReturnValue({} as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("restores the dataset editor tab from the location when only the tab changed", async () => {
    await runPopState({
      currentTab: "query",
      locationMode: "dataset",
      locationTab: "metadata",
    });

    expect(setQueryBuilderModeSpy).toHaveBeenCalledWith(
      "dataset",
      expect.objectContaining({
        datasetEditorTab: "metadata",
        shouldUpdateUrl: false,
      }),
    );
  });

  it("does not switch modes when both the mode and tab already match the location", async () => {
    await runPopState({
      currentTab: "metadata",
      locationMode: "dataset",
      locationTab: "metadata",
    });

    expect(setQueryBuilderModeSpy).not.toHaveBeenCalled();
  });
});
