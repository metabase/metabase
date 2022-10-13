import * as dashboardActions from "metabase/dashboard/actions/writeback";

import type {
  ActionParametersMapping,
  DashboardOrderedCard,
  ParametersForActionExecution,
  WritebackParameter,
} from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";
import type { UiParameter } from "metabase/parameters/types";

import {
  createMockDashboard,
  createMockDashboardActionButton,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionClickBehaviorData } from "./types";
import { prepareParameter, getNotProvidedActionParameters } from "./utils";
import ActionClickDrill from "./ActionClickDrill";

const WRITEBACK_PARAMETER: WritebackParameter = {
  id: "param-1",
  name: "Order ID",
  type: "number",
  slug: "order-id",
  target: ["variable", ["template-tag", "order-id"]],
};

const WRITEBACK_ARBITRARY_PARAMETER: WritebackParameter = {
  id: "param-2",
  name: "Discount",
  type: "number",
  slug: "discount",
  target: ["variable", ["template-tag", "discount"]],
};

const DASHBOARD_FILTER_PARAMETER: UiParameter = {
  id: "dashboard-filter-1",
  name: "Order",
  type: "number",
  slug: "order",
  value: 5,
};

const PARAMETER_MAPPING: ActionParametersMapping = {
  parameter_id: DASHBOARD_FILTER_PARAMETER.id,
  target: WRITEBACK_PARAMETER.target,
};

const dashboardParamterValues = {
  [DASHBOARD_FILTER_PARAMETER.id]: DASHBOARD_FILTER_PARAMETER.value,
};

function getActionClickBehaviorData(value: any): ActionClickBehaviorData {
  return {
    column: {},
    parameter: {
      [DASHBOARD_FILTER_PARAMETER.id]: { value },
    },
    parameterByName: {
      [DASHBOARD_FILTER_PARAMETER.name]: { value },
    },
    parameterBySlug: {
      [DASHBOARD_FILTER_PARAMETER.slug]: { value },
    },
    userAttribute: {},
  };
}

describe("prepareParameter", () => {
  it("returns nothing if can't find source parameter", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const parameter = prepareParameter(PARAMETER_MAPPING, action, {});

    expect(parameter).toBeUndefined();
  });

  it("returns nothing if can't find action parameter", () => {
    const action = createMockQueryAction({
      parameters: [],
    });

    const parameter = prepareParameter(
      PARAMETER_MAPPING,
      action,
      dashboardParamterValues,
    );

    expect(parameter).toBeUndefined();
  });

  it("prepares parameter correctly", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const parameter = prepareParameter(
      PARAMETER_MAPPING,
      action,
      dashboardParamterValues,
    );

    expect(parameter).toEqual([
      WRITEBACK_PARAMETER.id,
      DASHBOARD_FILTER_PARAMETER.value,
    ]);
  });

  it("handles array-like parameter value", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const parameter = prepareParameter(
      PARAMETER_MAPPING,
      action,
      dashboardParamterValues,
    );

    expect(parameter).toEqual([
      WRITEBACK_PARAMETER.id,
      DASHBOARD_FILTER_PARAMETER.value,
    ]);
  });
});

describe("getNotProvidedActionParameters", () => {
  it("returns empty list if no parameters passed", () => {
    const action = createMockQueryAction();

    const result = getNotProvidedActionParameters(action, {});

    expect(result).toHaveLength(0);
  });

  it("returns empty list if all parameters have values", () => {
    const action = createMockQueryAction({ parameters: [WRITEBACK_PARAMETER] });
    const result = getNotProvidedActionParameters(action, {
      [WRITEBACK_PARAMETER.id]: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("returns not mapped parameters", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER, WRITEBACK_ARBITRARY_PARAMETER],
    });

    const result = getNotProvidedActionParameters(action, {
      [WRITEBACK_ARBITRARY_PARAMETER.id]: 5,
    });

    expect(result).toEqual([WRITEBACK_PARAMETER]);
  });

  it("skips parameters with default values", () => {
    const action = createMockQueryAction({
      parameters: [{ ...WRITEBACK_PARAMETER, default: 10 }],
    });

    const result = getNotProvidedActionParameters(action, {});

    expect(result).toHaveLength(0);
  });
});

describe("ActionClickDrill", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function setup({
    missingParameters = [],
  }: {
    missingParameters?: WritebackParameter[];
  } = {}) {
    const submitSpy = jest.fn();
    const openActionParametersModalSpy = jest.spyOn(
      dashboardActions,
      "openActionParametersModal",
    );

    const action = createMockQueryAction();
    const dashcard = createMockDashboardActionButton({
      action,
    });
    const dashboard = createMockDashboard({
      ordered_cards: [dashcard as unknown as DashboardOrderedCard],
    });

    const onSubmit = jest.fn();

    const clickActions = ActionClickDrill({
      clicked: {
        data: [],
        extraData: {
          dashboard,
          dashcard,
          parameterValuesBySlug: {},
          userAttributes: [],
        },
        missingParameters,
        onSubmit: submitSpy,
      },
    });

    return {
      action,
      dashboard,
      dashcard,
      clickActions,
      submitSpy,
      openActionParametersModalSpy,
    };
  }

  it("executes action without missing parameters correctly", () => {
    const { clickActions, dashboard, dashcard, submitSpy } = setup({
      missingParameters: [],
    });
    const [clickAction] = clickActions;

    clickAction.action();

    expect(submitSpy).toHaveBeenCalled();
  });

  it("executes action with arbitrary parameters correctly", () => {
    const {
      clickActions,
      dashboard,
      dashcard,
      submitSpy,
      openActionParametersModalSpy,
    } = setup({
      missingParameters: [WRITEBACK_ARBITRARY_PARAMETER],
    });

    clickActions[0].action();

    // Ensure we're not trying to execute the action immediately
    // until we collect the arbitrary parameter value from a user
    expect(submitSpy).not.toHaveBeenCalled();

    // Emulate ActionParameterInputForm submission
    const { props } = openActionParametersModalSpy.mock.calls[0][0];
    props.onSubmit([
      {
        target: WRITEBACK_ARBITRARY_PARAMETER.target,
        value: 123,
        type: WRITEBACK_ARBITRARY_PARAMETER.type,
      },
    ]);

    expect(submitSpy).toHaveBeenCalledWith([
      {
        target: WRITEBACK_ARBITRARY_PARAMETER.target,
        value: 123,
        type: WRITEBACK_ARBITRARY_PARAMETER.type,
      },
    ]);
  });

  it("does nothing for buttons without linked action", () => {
    const dashcard = createMockDashboardActionButton({
      parameter_mappings: [PARAMETER_MAPPING],
    });
    const dashboard = createMockDashboard({
      ordered_cards: [dashcard as unknown as DashboardOrderedCard],
      parameters: [DASHBOARD_FILTER_PARAMETER],
    });

    const clickActions = ActionClickDrill({
      clicked: {
        data: [],
        extraData: {
          dashboard,
          dashcard,
          parameterValuesBySlug: {
            [DASHBOARD_FILTER_PARAMETER.slug]: DASHBOARD_FILTER_PARAMETER.value,
          },
          userAttributes: [],
        },
        onSubmit: jest.fn(),
        missingParameters: [],
      },
    });

    expect(clickActions).toHaveLength(0);
  });
});
