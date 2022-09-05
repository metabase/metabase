import * as dashboardActions from "metabase/dashboard/actions/writeback";

import type {
  ActionButtonParametersMapping,
  DashboardOrderedCard,
  WritebackParameter,
} from "metabase-types/api";
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

const PARAMETER_MAPPING: ActionButtonParametersMapping = {
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
  it("executes action correctly", () => {
    const executeActionSpy = jest.spyOn(dashboardActions, "executeRowAction");

    const action = createMockQueryAction({ parameters: [WRITEBACK_PARAMETER] });
    const dashcard = createMockDashboardActionButton({
      action,
      action_id: action.id,
      parameter_mappings: [PARAMETER_MAPPING],
    });
    const dashboard = createMockDashboard({
      ordered_cards: [dashcard as unknown as DashboardOrderedCard],
      parameters: [DASHBOARD_FILTER_PARAMETER],
    });

    const [clickAction] = ActionClickDrill({
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
