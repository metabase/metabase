import { createMockDashboard } from "metabase-types/api/mocks";

import {
  INITIALIZE,
  SET_EDITING_DASHBOARD,
  SET_SIDEBAR,
  CLOSE_SIDEBAR,
  REMOVE_PARAMETER,
  SET_DASHBOARD_ATTRIBUTES,
  FETCH_DASHBOARD_CARD_DATA,
  FETCH_CARD_DATA,
  FETCH_CARD_DATA_PENDING,
} from "./actions";
import { dashboardReducers as reducer } from "./reducers";

const TEST_DASHBOARD = createMockDashboard();

describe("dashboard reducers", () => {
  let initState;
  beforeEach(() => {
    initState = reducer(undefined, {});
  });

  it("should return the initial state", () => {
    expect(initState).toEqual({
      dashboardId: null,
      selectedTabId: null,
      dashboards: {},
      dashcardData: {},
      dashcards: {},
      isAddParameterPopoverOpen: false,
      isNavigatingBackToDashboard: false,
      editingDashboard: null,
      loadingDashCards: {
        loadingIds: [],
        startTime: null,
        endTime: null,
        loadingStatus: "idle",
      },
      parameterValues: {},
      draftParameterValues: {},
      sidebar: { props: {} },
      slowCards: {},
      loadingControls: {},
      missingActionParameters: null,
      autoApplyFilters: {
        toastId: null,
        toastDashboardId: null,
      },
      tabDeletions: {},
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
      ).toEqual({ ...initState, editingDashboard: null });
    });

    it("should return unchanged state if `clearCache: false` passed", () => {
      expect(
        reducer(
          {
            ...initState,
            draftParameterValues: {
              "60bca071": ["Gadget", "Doohickey", "Gizmo"],
            },
          },
          {
            type: INITIALIZE,
            payload: {
              clearCache: false,
            },
          },
        ),
      ).toEqual({
        ...initState,
        draftParameterValues: {
          "60bca071": ["Gadget", "Doohickey", "Gizmo"],
        },
      });
    });

    it("should reset state if `clearCache`: false` is not passed", () => {
      expect(
        reducer(
          {
            ...initState,
            draftParameterValues: {
              "60bca071": ["Gadget", "Doohickey", "Gizmo"],
            },
          },
          {
            type: INITIALIZE,
          },
        ),
      ).toEqual(initState);
    });
  });

  describe("SET_EDITING_DASHBOARD", () => {
    it("should clear sidebar state when entering edit mode", () => {
      const state = {
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      };
      expect(
        reducer(state, {
          type: SET_EDITING_DASHBOARD,
          payload: TEST_DASHBOARD,
        }),
      ).toEqual({
        ...state,
        editingDashboard: TEST_DASHBOARD,
        sidebar: { props: {} },
      });
    });

    it("should clear sidebar state when leaving edit mode", () => {
      const state = {
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      };
      expect(
        reducer(state, {
          type: SET_EDITING_DASHBOARD,
          payload: null,
        }),
      ).toEqual({ ...initState, editingDashboard: null });
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

  describe("SET_DASHBOARD_ATTRIBUTES", () => {
    const emptyDashboard = {
      archived: false,
      dashcards: [],
      can_write: true,
      enable_embedding: false,
      show_in_getting_started: false,
      name: "Dashboard",
      creator_id: 1,
      updated_at: "2021-01-01T01:01:01.001",
      id: 1,
      "last-edit-info": {
        id: 1,
        email: "testin@metabase.com",
        first_name: "Test",
        last_name: "Metabase",
        timestamp: "2021-01-01T01:01:01.001",
      },
      parameters: [],
      created_at: "2021-01-01T01:01:01.001",
    };

    it("should set attribute and isDirty", () => {
      expect(
        reducer(
          {
            ...initState,
            dashboards: { 1: emptyDashboard },
          },
          {
            type: SET_DASHBOARD_ATTRIBUTES,
            payload: {
              id: 1,
              attributes: { name: "New Name" },
            },
          },
        ),
      ).toEqual({
        ...initState,
        dashboards: {
          1: {
            ...emptyDashboard,
            name: "New Name",
            isDirty: true,
          },
        },
      });
    });

    it("should set isDirty to false", () => {
      expect(
        reducer(
          {
            ...initState,
            dashboards: { 1: emptyDashboard },
          },
          {
            type: SET_DASHBOARD_ATTRIBUTES,
            payload: {
              id: 1,
              attributes: { name: "New Name" },
              isDirty: false,
            },
          },
        ),
      ).toEqual({
        ...initState,
        dashboards: {
          1: {
            ...emptyDashboard,
            name: "New Name",
            isDirty: false,
          },
        },
      });
    });
  });

  describe("Should accurately describe loading state", () => {
    //Can't check straight equality due to state.loadingDashCards.startTime being a time.
    it("should change to running when loading cards", () => {
      const dashcardIds = [1, 2, 3];
      const loadingMatch = {
        loadingIds: dashcardIds,
        loadingStatus: "running",
        startTime: expect.any(Number),
      };

      expect(
        reducer(
          {
            ...initState,
            loadingDashCards: {
              loadingIds: dashcardIds,
            },
          },
          {
            type: FETCH_DASHBOARD_CARD_DATA,
            payload: { currentTime: 100, loadingIds: dashcardIds },
          },
        ),
      ).toMatchObject({
        ...initState,
        loadingDashCards: loadingMatch,
      });
    });

    it("should stay idle with no cards to load", () => {
      expect(
        reducer(initState, {
          type: FETCH_DASHBOARD_CARD_DATA,
          payload: { currentTime: 100, loadingIds: [] },
        }),
      ).toEqual({
        ...initState,
        loadingDashCards: {
          loadingIds: [],
          loadingStatus: "idle",
          startTime: null,
          endTime: null,
        },
      });
    });

    it("should be complete when loading finishes", () => {
      expect(
        reducer(
          {
            ...initState,
            loadingDashCards: {
              loadingIds: [3],
              loadingStatus: "running",
              startTime: 100,
            },
          },
          {
            type: FETCH_CARD_DATA,
            payload: {
              dashcard_id: 3,
              card_id: 1,
              result: {},
              currentTime: 200,
            },
          },
        ),
      ).toEqual({
        ...initState,
        loadingDashCards: {
          loadingIds: [],
          loadingStatus: "complete",
          startTime: 100,
          endTime: 200,
        },
        dashcardData: { 3: { 1: {} } },
      });
    });

    it("should not have duplicated elements in loadingIds on pending (metabase#33692, metabase#34767)", () => {
      const result = reducer(
        {
          ...initState,
          loadingDashCards: {
            loadingIds: [3],
            loadingStatus: "running",
            startTime: 100,
          },
        },
        {
          type: FETCH_CARD_DATA_PENDING,
          payload: {
            dashcard_id: 3,
            card_id: 1,
          },
        },
      );
      expect(result.loadingDashCards.loadingIds).toEqual([3]);
    });
  });
});
