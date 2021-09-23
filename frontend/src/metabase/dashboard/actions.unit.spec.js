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
  setParameterValue,
  SET_PARAMETER_VALUE,
  setParameterValues,
} from "./actions";
import { SIDEBAR_NAME } from "./constants";

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
        parameterValues: {
          123: "abc",
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

  describe("setParameterValue", () => {
    it("should set the parameter with value", () => {
      dispatch(setParameterValue(123, "abc"));

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_PARAMETER_VALUE,
        payload: {
          id: 123,
          value: "abc",
        },
      });
    });
  });

  describe("setParameterValues", () => {
    it("should set multiple parameters without unsetting existing ones", () => {
      setParameterValues([[123, "abc"], [456, "def"]])(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_PARAMETER_VALUE,
        payload: {
          id: 123,
          value: "abc",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: SET_PARAMETER_VALUE,
        payload: {
          id: 456,
          value: "def",
        },
      });
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
});
