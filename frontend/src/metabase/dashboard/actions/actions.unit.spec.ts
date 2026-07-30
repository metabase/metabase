import type { Dispatch, GetState } from "metabase/redux/store";
import {
  createMockDashboardState,
  createMockLocation,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { SIDEBAR_NAME } from "../constants";

import {
  CLOSE_SIDEBAR,
  SET_DASHBOARD_ATTRIBUTES,
  SET_EDITING_DASHBOARD,
  SET_SIDEBAR,
  closeSidebar,
  openAddQuestionSidebar,
  removeParameter,
  setEditingDashboard,
  setEditingParameter,
  setSharing,
  setSidebar,
  showClickBehaviorSidebar,
  updateDashboardAndCards,
} from "./";

describe("dashboard actions", () => {
  let dispatch: jest.MockedFunction<Dispatch>;
  let getState: GetState;

  beforeEach(() => {
    dispatch = jest.fn();
    getState = () =>
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              parameters: [
                createMockParameter({ id: "123" }),
                createMockParameter({ id: "456" }),
              ],
            }),
          },
        }),
      });
  });

  describe("setSidebar", () => {
    it("should create a SET_SIDEBAR action with sidebar payload", () => {
      const sidebar = {
        name: SIDEBAR_NAME.sharing,
      };

      expect(setSidebar(sidebar)).toEqual({
        type: SET_SIDEBAR,
        payload: sidebar,
      });
    });
  });

  describe("closeSidebar", () => {
    it("should create a CLOSE_SIDEBAR action", () => {
      expect(closeSidebar()).toEqual({
        type: CLOSE_SIDEBAR,
      });
    });
  });

  describe("setSharing", () => {
    it("should set a sharing sidebar when the `isSharing` boolean arg is true", () => {
      setSharing(true)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        setSidebar({ name: SIDEBAR_NAME.sharing }),
      );
    });

    it("should clear sidebar state when the `isSharing` boolean arg is false", () => {
      setSharing(false)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(closeSidebar());
    });
  });

  describe("showClickBehaviorSidebar", () => {
    it("should set a click behavior sidebar when given a dashcardId", () => {
      showClickBehaviorSidebar(0)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        setSidebar({
          name: SIDEBAR_NAME.clickBehavior,
          props: { dashcardId: 0 },
        }),
      );
    });

    it("should clear sidebar state when given a nil dashcardId", () => {
      showClickBehaviorSidebar(null)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(closeSidebar());
    });
  });

  describe("setEditingParameter", () => {
    it("should set an edit parameter sidebar when given a parameterId", () => {
      setEditingParameter("0")(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        setSidebar({
          name: SIDEBAR_NAME.editParameter,
          props: { parameterId: "0" },
        }),
      );
    });

    it("should clear sidebar state when given a nil parameterId", () => {
      setEditingParameter(null)(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(closeSidebar());
    });
  });

  describe("openAddQuestionSidebar", () => {
    it("should set an add question sidebar", () => {
      openAddQuestionSidebar()(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        setSidebar({
          name: SIDEBAR_NAME.addQuestion,
        }),
      );
    });
  });

  describe("removeParameter", () => {
    it("should remove the parameter from the dashboard with the given parameterId", () => {
      removeParameter("123")(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_DASHBOARD_ATTRIBUTES,
        payload: {
          id: 1,
          attributes: {
            parameters: [createMockParameter({ id: "456" })],
          },
        },
      });
    });

    it("should not remove any parameters if the given parameterId does not match a parameter on the dashboard", () => {
      removeParameter("999")(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_DASHBOARD_ATTRIBUTES,
        payload: {
          id: 1,
          attributes: {
            parameters: getState().dashboard.dashboards["1"]?.parameters,
          },
        },
      });
    });
  });

  describe("updateDashboardAndCards", () => {
    it("should not save anything if the dashboard has not changed", async () => {
      const dashcard1 = createMockDashboardCard({ id: 1, card_id: 1 });
      const dashcard2 = createMockDashboardCard({ id: 2, card_id: 2 });

      const storeDashboard = createMockStoreDashboard({
        id: 1,
        name: "Foo",
        parameters: [],
        dashcards: [1, 2],
      });

      const getState: GetState = () =>
        createMockState({
          dashboard: createMockDashboardState({
            editingDashboard: createMockDashboard({
              ...storeDashboard,
              dashcards: [dashcard1, dashcard2],
            }),
            dashboardId: 1,
            dashboards: {
              "1": storeDashboard,
            },
            dashcards: {
              "1": dashcard1,
              "2": dashcard2,
            },
          }),
        });

      await updateDashboardAndCards()(dispatch, getState);

      // createThunkAction dispatches the result action once;
      // no additional dispatches means the dashboard was not saved
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("setEditingDashboard", () => {
    it("should remove any hash parameters from url when not editing", () => {
      const location = createMockLocation({
        pathname: "/dashboard/1",
        hash: "#hashparam",
      });

      setEditingDashboard(null, location)(dispatch);

      expect(dispatch).toHaveBeenCalledWith({
        payload: {
          args: ["/dashboard/1"],
          method: "push",
        },
        type: "@@router/CALL_HISTORY_METHOD",
      });
    });

    // The v3 history rebuilds `search` from `query`, so pushing a location
    // object without a `query` field silently drops params like the open tab.
    it("should keep query params when leaving edit mode", () => {
      const location = createMockLocation({
        pathname: "/dashboard/1",
        search: "?tab=2-tab-two",
        hash: "#hashparam",
      });

      setEditingDashboard(null, location)(dispatch);

      expect(dispatch).toHaveBeenCalledWith({
        payload: {
          args: ["/dashboard/1?tab=2-tab-two"],
          method: "push",
        },
        type: "@@router/CALL_HISTORY_METHOD",
      });
    });

    // The location is captured when the caller rendered, so navigating with no
    // hash to strip would clobber query params written since (the dashboard tab
    // sync writes `?tab=` as edit mode exits).
    it("should not navigate when there is no hash to strip", () => {
      const location = createMockLocation({
        pathname: "/dashboard/1",
        search: "?tab=2-tab-two",
      });

      setEditingDashboard(null, location)(dispatch);

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "@@router/CALL_HISTORY_METHOD" }),
      );
      expect(dispatch).toHaveBeenCalledWith({
        type: SET_EDITING_DASHBOARD,
        payload: null,
      });
    });
  });
});
