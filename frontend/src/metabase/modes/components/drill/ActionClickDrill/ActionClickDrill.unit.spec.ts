import * as dashboardActions from "metabase/dashboard/actions/writeback";

import type {
  ActionParametersMapping,
  DashboardOrderedCard,
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

    const parameter = prepareParameter(PARAMETER_MAPPING, {
      data: {
        column: {},
        parameter: {},
        parameterByName: {},
        parameterBySlug: {},
        userAttribute: {},
      },
      action,
    });

    expect(parameter).toBeUndefined();
  });

  it("returns nothing if can't find action parameter", () => {
    const action = createMockQueryAction({
      parameters: [],
    });

    const parameter = prepareParameter(PARAMETER_MAPPING, {
      data: getActionClickBehaviorData(DASHBOARD_FILTER_PARAMETER.value),
      action,
    });

    expect(parameter).toBeUndefined();
  });

  it("prepares parameter correctly", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const parameter = prepareParameter(PARAMETER_MAPPING, {
      data: getActionClickBehaviorData(DASHBOARD_FILTER_PARAMETER.value),
      action,
    });

    expect(parameter).toEqual({
      id: DASHBOARD_FILTER_PARAMETER.id,
      type: WRITEBACK_PARAMETER.type,
      value: DASHBOARD_FILTER_PARAMETER.value,
      target: WRITEBACK_PARAMETER.target,
    });
  });

  it("handles array-like parameter value", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const parameter = prepareParameter(PARAMETER_MAPPING, {
      data: getActionClickBehaviorData([DASHBOARD_FILTER_PARAMETER.value]),
      action,
    });

    expect(parameter).toEqual({
      id: DASHBOARD_FILTER_PARAMETER.id,
      type: WRITEBACK_PARAMETER.type,
      value: DASHBOARD_FILTER_PARAMETER.value,
      target: WRITEBACK_PARAMETER.target,
    });
  });
});

describe("getNotProvidedActionParameters", () => {
  it("returns empty list if no parameters passed", () => {
    const action = createMockQueryAction();

    const result = getNotProvidedActionParameters(action, [], []);

    expect(result).toHaveLength(0);
  });

  it("returns empty list if all parameters have values", () => {
    const action = createMockQueryAction({ parameters: [WRITEBACK_PARAMETER] });

    const result = getNotProvidedActionParameters(
      action,
      [PARAMETER_MAPPING],
      [
        {
          id: DASHBOARD_FILTER_PARAMETER.id,
          value: 5,
          type: "number",
          target: WRITEBACK_ARBITRARY_PARAMETER.target,
        },
      ],
    );

    expect(result).toHaveLength(0);
  });

  it("returns not mapped parameters", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER, WRITEBACK_ARBITRARY_PARAMETER],
    });

    const result = getNotProvidedActionParameters(
      action,
      [PARAMETER_MAPPING],
      [
        {
          id: DASHBOARD_FILTER_PARAMETER.id,
          value: 5,
          type: "number",
          target: WRITEBACK_ARBITRARY_PARAMETER.target,
        },
      ],
    );

    expect(result).toEqual([WRITEBACK_ARBITRARY_PARAMETER]);
  });

  it("returns mapped parameters without value", () => {
    const action = createMockQueryAction({
      parameters: [WRITEBACK_PARAMETER],
    });

    const result = getNotProvidedActionParameters(
      action,
      [PARAMETER_MAPPING],
      [
        {
          id: DASHBOARD_FILTER_PARAMETER.id,
          type: "number",
          target: WRITEBACK_PARAMETER.target,

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          value: undefined,
        },
      ],
    );

    expect(result).toEqual([WRITEBACK_PARAMETER]);
  });

  it("skips parameters with default values", () => {
    const action = createMockQueryAction({
      parameters: [{ ...WRITEBACK_PARAMETER, default: 10 }],
    });

    const result = getNotProvidedActionParameters(action, [], []);

    expect(result).toHaveLength(0);
  });
});

describe("ActionClickDrill", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function setup({
    actionParameters = [],
    dashboardParameters = [],
    parameterMappings = [],
    parameterValuesBySlug = {},
  }: {
    actionParameters?: WritebackParameter[];
    dashboardParameters?: UiParameter[];
    parameterMappings?: ActionParametersMapping[];
    parameterValuesBySlug?: Record<string, { value: ParameterValueOrArray }>;
  } = {}) {
    const executeActionSpy = jest.spyOn(dashboardActions, "executeRowAction");
    const openActionParametersModalSpy = jest.spyOn(
      dashboardActions,
      "openActionParametersModal",
    );

    const action = createMockQueryAction({ parameters: actionParameters });
    const dashcard = createMockDashboardActionButton({
      action,
      action_id: action.id,
      parameter_mappings: parameterMappings,
    });
    const dashboard = createMockDashboard({
      ordered_cards: [dashcard as unknown as DashboardOrderedCard],
      parameters: dashboardParameters,
    });

    const clickActions = ActionClickDrill({
      clicked: {
        data: [],
        extraData: {
          dashboard,
          dashcard,
          parameterValuesBySlug,
          userAttributes: [],
        },
      },
    });

    return {
      action,
      dashboard,
      dashcard,
      clickActions,
      executeActionSpy,
      openActionParametersModalSpy,
    };
  }

  it("executes action correctly", () => {
    const { clickActions, dashboard, dashcard, executeActionSpy } = setup({
      actionParameters: [WRITEBACK_PARAMETER],
      dashboardParameters: [DASHBOARD_FILTER_PARAMETER],
      parameterMappings: [PARAMETER_MAPPING],
      parameterValuesBySlug: {
        [DASHBOARD_FILTER_PARAMETER.slug]: DASHBOARD_FILTER_PARAMETER.value,
      },
    });
    const [clickAction] = clickActions;

    clickAction.action();

    expect(executeActionSpy).toBeCalledWith({
      dashboard,
      dashcard,
      parameters: [
        {
          id: DASHBOARD_FILTER_PARAMETER.id,
          type: WRITEBACK_PARAMETER.type,
          value: DASHBOARD_FILTER_PARAMETER.value,
          target: WRITEBACK_PARAMETER.target,
        },
      ],
      extra_parameters: [],
    });
  });

  it("executes action with arbitrary parameters correctly", () => {
    const {
      clickActions,
      dashboard,
      dashcard,
      executeActionSpy,
      openActionParametersModalSpy,
    } = setup({
      actionParameters: [WRITEBACK_PARAMETER, WRITEBACK_ARBITRARY_PARAMETER],
      dashboardParameters: [DASHBOARD_FILTER_PARAMETER],
      parameterMappings: [PARAMETER_MAPPING],
      parameterValuesBySlug: {
        [DASHBOARD_FILTER_PARAMETER.slug]: DASHBOARD_FILTER_PARAMETER.value,
      },
    });

    clickActions[0].action();

    // Ensure we're not trying to execute the action immediately
    // until we collect the arbitrary parameter value from a user
    expect(executeActionSpy).not.toHaveBeenCalled();

    // Emulate ActionParameterInputForm submission
    const { props } = openActionParametersModalSpy.mock.calls[0][0];
    props.onSubmit([
      {
        target: WRITEBACK_ARBITRARY_PARAMETER.target,
        value: 123,
        type: WRITEBACK_ARBITRARY_PARAMETER.type,
      },
    ]);

    expect(executeActionSpy).toHaveBeenCalledWith({
      dashboard,
      dashcard,
      parameters: [
        {
          id: DASHBOARD_FILTER_PARAMETER.id,
          type: WRITEBACK_PARAMETER.type,
          value: DASHBOARD_FILTER_PARAMETER.value,
          target: WRITEBACK_PARAMETER.target,
        },
      ],
      extra_parameters: [
        {
          target: WRITEBACK_ARBITRARY_PARAMETER.target,
          value: 123,
          type: WRITEBACK_ARBITRARY_PARAMETER.type,
        },
      ],
    });
  });

  it("does nothing for buttons without linked action", () => {
    const dashcard = createMockDashboardActionButton({
      action_id: null,
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
      },
    });

    expect(clickActions).toHaveLength(0);
  });
});
