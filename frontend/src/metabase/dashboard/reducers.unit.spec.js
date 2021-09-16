import reducer from "./reducers";
import {
  INITIALIZE,
  SET_EDITING_DASHBOARD,
  SET_SIDEBAR,
  CLOSE_SIDEBAR,
  REMOVE_PARAMETER,
} from "./actions";

describe("dashboard reducers", () => {
  let initState;
  beforeEach(() => {
    initState = reducer(undefined, {});
  });

  it("should return the initial state", () => {
    expect(initState).toEqual({
      dashboardId: null,
      dashboards: {},
      dashcardData: {},
      dashcards: {},
      isAddParameterPopoverOpen: false,
      isEditing: {},
      loadingDashCards: {
        dashcardIds: [],
        loadingIds: [],
        startTime: null,
      },
      parameterValues: {},
      sidebar: { props: {} },
      slowCards: {},
    });
  });

  describe("SET_SIDEBAR", () => {
    it("should set the sidebar", () => {
      expect(
        reducer(undefined, {
          type: SET_SIDEBAR,
          payload: { name: "foo", props: { abc: 123 } },
        }),
      ).toEqual({
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      });
    });

    it("should default `props` to an object", () => {
      expect(
        reducer(undefined, {
          type: SET_SIDEBAR,
          payload: { name: "foo" },
        }),
      ).toEqual({
        ...initState,
        sidebar: { name: "foo", props: {} },
      });
    });
  });

  describe("CLOSE_SIDEBAR", () => {
    it("should return `sidebar` to initial state", () => {
      expect(
        reducer(
          {
            ...initState,
            sidebar: { name: "foo", props: { abc: 123 } },
          },
          {
            type: CLOSE_SIDEBAR,
          },
        ),
      ).toEqual(initState);
    });
  });

  describe("INITIALIZE", () => {
    it("should return `sidebar` to initial state", () => {
      expect(
        reducer(
          {
            ...initState,
            sidebar: { name: "foo", props: { abc: 123 } },
          },
          {
            type: INITIALIZE,
          },
        ),
      ).toEqual({ ...initState, isEditing: null });
    });
  });

  describe("SET_EDITING_DASHBOARD", () => {
    it("should preserve sidebar state if payload is true to signify the entering of dashboard edit mode", () => {
      const state = {
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      };
      expect(
        reducer(state, {
          type: SET_EDITING_DASHBOARD,
          payload: true,
        }),
      ).toEqual({ ...state, isEditing: true });
    });

    it("should clear sideabr state when leaving edit mode", () => {
      const state = {
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      };
      expect(
        reducer(state, {
          type: SET_EDITING_DASHBOARD,
          payload: false,
        }),
      ).toEqual({ ...initState, isEditing: null });
    });
  });

  describe("REMOVE_PARAMETER", () => {
    it("should clear sidebar state and remove the associated parameter value", () => {
      expect(
        reducer(
          {
            ...initState,
            sidebar: { name: "foo", props: { abc: 123 } },
            parameterValues: { 123: "abc", 456: "def" },
          },
          {
            type: REMOVE_PARAMETER,
            payload: { id: 123 },
          },
        ),
      ).toEqual({ ...initState, parameterValues: { 456: "def" } });
    });
  });
});
