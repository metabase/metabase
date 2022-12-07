import reducer from "./reducers";
import {
  INITIALIZE,
  SET_EDITING_DASHBOARD,
  SET_SIDEBAR,
  CLOSE_SIDEBAR,
  REMOVE_PARAMETER,
  SET_DASHBOARD_ATTRIBUTES,
  FETCH_DASHBOARD_CARD_DATA,
  FETCH_CARD_DATA,
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
      isEditing: null,
      loadingDashCards: {
        dashcardIds: [],
        loadingIds: [],
        startTime: null,
        loadingStatus: "idle",
      },
      parameterValues: {},
      parameterValuesSearchCache: {},
      sidebar: { props: {} },
      slowCards: {},
      loadingControls: {},
      missingActionParameters: null,
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
    it("should clear sideabr state when entering edit mode", () => {
      const state = {
        ...initState,
        sidebar: { name: "foo", props: { abc: 123 } },
      };
      expect(
        reducer(state, {
          type: SET_EDITING_DASHBOARD,
          payload: true,
        }),
      ).toEqual({ ...state, isEditing: true, sidebar: { props: {} } });
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

  describe("SET_DASHBOARD_ATTRIBUTES", () => {
    const emptyDashboard = {
      archived: false,
      ordered_cards: [],
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
        dashcardIds: dashcardIds,
        loadingIds: dashcardIds,
        loadingStatus: "running",
        startTime: expect.any(Number),
      };

      expect(
        reducer(
          {
            ...initState,
            loadingDashCards: {
              dashcardIds: dashcardIds,
              loadingIds: dashcardIds,
            },
          },
          {
            type: FETCH_DASHBOARD_CARD_DATA,
            payload: {},
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
          payload: {},
        }),
      ).toEqual({
        ...initState,
        loadingDashCards: {
          dashcardIds: [],
          loadingIds: [],
          loadingStatus: "idle",
          startTime: null,
        },
      });
    });

    it("should be complete when loading finishes", () => {
      expect(
        reducer(
          {
            ...initState,
            loadingDashCards: {
              dashcardIds: [1, 2, 3],
              loadingIds: [3],
              loadingStatus: "running",
            },
          },
          {
            type: FETCH_CARD_DATA,
            payload: { dashcard_id: 3, card_id: 1, result: {} },
          },
        ),
      ).toEqual({
        ...initState,
        loadingDashCards: {
          dashcardIds: [1, 2, 3],
          loadingIds: [],
          loadingStatus: "complete",
          startTime: null,
        },
        dashcardData: { 3: { 1: {} } },
      });
    });
  });
});
