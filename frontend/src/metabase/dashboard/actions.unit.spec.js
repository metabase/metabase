import { DashboardApi } from "metabase/services";

import {
  setSidebar,
  SET_SIDEBAR,
  closeSidebar,
  CLOSE_SIDEBAR,
  setSharing,
  showClickBehaviorSidebar,
  setEditingParameter,
  openAddQuestionSidebar,
  removeParameter,
  SET_DASHBOARD_ATTRIBUTES,
  fetchDashboardParameterValuesWithCache,
  FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
} from "./actions";
import { SIDEBAR_NAME } from "./constants";

DashboardApi.parameterSearch = jest.fn();
DashboardApi.parameterValues = jest.fn();

describe("dashboard actions", () => {
  let dispatch;
  let getState;
  beforeEach(() => {
    dispatch = jest.fn();
    getState = () => ({
      dashboard: {
        dashboardId: 1,
        dashboards: {
          1: {
            id: 1,
            parameters: [{ id: 123 }, { id: 456 }],
          },
        },
      },
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
      setEditingParameter(0)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        setSidebar({
          name: SIDEBAR_NAME.editParameter,
          props: { parameterId: 0 },
        }),
      );
    });

    it("should clear sidebar state when given a nil parameterId", () => {
      setEditingParameter()(dispatch);

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
      removeParameter(123)(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_DASHBOARD_ATTRIBUTES,
        payload: {
          id: 1,
          attributes: {
            parameters: [{ id: 456 }],
          },
        },
      });
    });

    it("should not remove any parameters if the given parameterId does not match a parameter on the dashboard", () => {
      removeParameter(999)(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_DASHBOARD_ATTRIBUTES,
        payload: {
          id: 1,
          attributes: {
            parameters: getState().dashboard.dashboards[1].parameters,
          },
        },
      });
    });
  });

  describe("fetchDashboardParameterValuesWithCache", () => {
    const dashboardId = 1;
    const parameter = { id: "a" };
    const parameterWithFilteringParameters = {
      id: "a",
      filteringParameters: ["b", "c"],
    };
    const parameters = [
      { id: "a", value: "aaa" },
      { id: "b", value: "bbb" },
      { id: "c", value: null },
    ];

    let parameterValuesSearchCache;
    const getState = () => ({
      dashboard: {
        parameterValuesSearchCache,
      },
    });

    beforeEach(() => {
      DashboardApi.parameterSearch.mockReset();
      DashboardApi.parameterSearch.mockResolvedValue({
        has_more_values: false,
        values: [1, 2, 3],
      });
      DashboardApi.parameterValues.mockReset();
      DashboardApi.parameterValues.mockResolvedValue({
        has_more_values: true,
        values: [4, 5, 6],
      });
      parameterValuesSearchCache = {};
    });

    it("should fetch parameter values using the given query string and always set has_more_values to true", async () => {
      const action = await fetchDashboardParameterValuesWithCache({
        dashboardId,
        parameter,
        parameters,
        query: "foo",
      })(dispatch, getState);

      expect(DashboardApi.parameterSearch).toHaveBeenCalledWith({
        dashId: 1,
        paramId: "a",
        query: "foo",
      });
      expect(action).toEqual({
        payload: {
          cacheKey:
            "dashboardId: 1, parameterId: a, query: foo, filteringParameterValues: []",
          has_more_values: true,
          results: [[1], [2], [3]],
        },
        type: FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
      });
    });

    it("should fetch parameter values without a query string", async () => {
      const action = await fetchDashboardParameterValuesWithCache({
        dashboardId,
        parameter,
        parameters,
      })(dispatch, getState);

      expect(DashboardApi.parameterValues).toHaveBeenCalledWith({
        dashId: 1,
        paramId: "a",
        query: undefined,
      });
      expect(action).toEqual({
        payload: {
          cacheKey:
            "dashboardId: 1, parameterId: a, query: null, filteringParameterValues: []",
          results: [[4], [5], [6]],
          has_more_values: true,
        },
        type: FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
      });
    });

    it("should fetch parameter values using a query string and filtering parameters", async () => {
      const action = await fetchDashboardParameterValuesWithCache({
        dashboardId,
        parameter: parameterWithFilteringParameters,
        parameters,
        query: "bar",
      })(dispatch, getState);

      expect(DashboardApi.parameterSearch).toHaveBeenCalledWith({
        dashId: 1,
        paramId: "a",
        query: "bar",
        b: "bbb",
      });
      expect(action).toEqual({
        payload: {
          cacheKey:
            'dashboardId: 1, parameterId: a, query: bar, filteringParameterValues: [["b","bbb"]]',
          results: [[1], [2], [3]],
          has_more_values: true,
        },
        type: FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
      });
    });

    it("should fetch parameter values without a query string but with filtering parameters", async () => {
      const action = await fetchDashboardParameterValuesWithCache({
        dashboardId,
        parameter: parameterWithFilteringParameters,
        parameters,
      })(dispatch, getState);

      expect(DashboardApi.parameterValues).toHaveBeenCalledWith({
        dashId: 1,
        paramId: "a",
        query: undefined,
        b: "bbb",
      });
      expect(action).toEqual({
        payload: {
          cacheKey:
            'dashboardId: 1, parameterId: a, query: null, filteringParameterValues: [["b","bbb"]]',
          results: [[4], [5], [6]],
          has_more_values: true,
        },
        type: FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
      });
    });

    it("should not query when values exist in the cache", async () => {
      const cacheKey =
        'dashboardId: 1, parameterId: a, query: bar, filteringParameterValues: [["b","bbb"]]';
      parameterValuesSearchCache = {
        [cacheKey]: [[1], [2], [3]],
      };

      const action = await fetchDashboardParameterValuesWithCache({
        dashboardId,
        parameter: parameterWithFilteringParameters,
        parameters,
        query: "bar",
      })(dispatch, getState);

      expect(DashboardApi.parameterSearch).not.toHaveBeenCalled();
      expect(DashboardApi.parameterValues).not.toHaveBeenCalled();

      expect(action).toEqual({
        payload: undefined,
        type: FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
      });
    });
  });
});
