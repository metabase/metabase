import { DashboardApi } from "metabase/services";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";
import type { Dispatch, GetState } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockRoutingState,
  createMockState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks/index";

import { SIDEBAR_NAME } from "../constants";

import {
  CLOSE_SIDEBAR,
  SET_DASHBOARD_ATTRIBUTES,
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
} from "./index";

DashboardApi.parameterSearch = jest.fn();
DashboardApi.parameterValues = jest.fn();

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
            parameters: [{ id: "456" }],
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
            parameters: getState().dashboard.dashboards["1"].parameters,
          },
        },
      });
    });
  });

  describe("updateDashboardAndCards", () => {
    it("should not save anything if the dashboard has not changed", async () => {
      const dashboard = {
        id: 1 as const,
        name: "Foo",
        parameters: [],
      };
      const dashcard1 = createMockDashboardCard({ id: 1, card_id: 1 });
      const dashcard2 = createMockDashboardCard({ id: 2, card_id: 2 });

      const getState: GetState = () =>
        createMockState({
          dashboard: createMockDashboardState({
            editingDashboard: createMockDashboard({
              ...dashboard,
              dashcards: [dashcard1, dashcard2],
            }),
            dashboardId: 1,
            dashboards: {
              "1": createMockStoreDashboard({
                ...dashboard,
                dashcards: [1, 2],
              }),
            },
            dashcards: {
              "1": dashcard1,
              "2": dashcard2,
            },
          }),
        });

      await updateDashboardAndCards()(dispatch, getState);

      // if this is called only once, it means that the dashboard was not saved
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("setEditingDashboard", () => {
    const getState: GetState = () =>
      createMockState({
        routing: createMockRoutingState({
          locationBeforeTransitions: {
            action: "POP",
            key: "",
            pathname: "/dashboard/1",
            query: {},
            search: "",
            hash: "#hashparam",
            state: undefined,
          },
        }),
      });

    it("should remove any hash parameters from url when not editing", () => {
      setEditingDashboard(null)(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        payload: {
          args: [
            {
              action: "POP",
              hash: "",
              key: "",
              pathname: "/dashboard/1",
              query: {},
              search: "",
              state: undefined,
            },
          ],
          method: "push",
        },
        type: "@@router/CALL_HISTORY_METHOD",
      });
    });
  });
});
