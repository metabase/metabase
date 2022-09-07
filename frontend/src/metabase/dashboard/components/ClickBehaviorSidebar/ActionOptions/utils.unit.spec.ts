import type {
  ActionButtonParametersMapping,
  ClickBehaviorParameterMapping,
  WritebackParameter,
} from "metabase-types/api";
import type { UiParameter } from "metabase/parameters/types";

import {
  createMockDashboardActionButton,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import {
  turnClickBehaviorParameterMappingsIntoDashCardMappings,
  turnDashCardParameterMappingsIntoClickBehaviorMappings,
} from "./utils";

const WRITEBACK_PARAMETER: WritebackParameter = {
  id: "param-1",
  name: "Order ID",
  type: "number",
  slug: "order-id",
  target: ["variable", ["template-tag", "order-id"]],
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

const CLICK_BEHAVIOR_PARAMETER_MAPPINGS: ClickBehaviorParameterMapping = {
  [WRITEBACK_PARAMETER.id]: {
    id: WRITEBACK_PARAMETER.id,
    target: {
      id: WRITEBACK_PARAMETER.id,
      type: "parameter",
    },
    source: {
      id: DASHBOARD_FILTER_PARAMETER.id,
      name: DASHBOARD_FILTER_PARAMETER.name,
      type: "parameter",
    },
  },
};

describe("turnDashCardParameterMappingsIntoClickBehaviorMappings", () => {
  type SetupOpts = {
    actionParameters?: WritebackParameter[] | undefined;
    dashCardParameterMappings?: ActionButtonParametersMapping[] | null;
  };

  function setup({
    actionParameters = [],
    dashCardParameterMappings = [],
  }: SetupOpts = {}) {
    const action = createMockQueryAction({ parameters: actionParameters });
    const dashCard = createMockDashboardActionButton({
      action,
      action_id: action.id,
      parameter_mappings: dashCardParameterMappings,
    });
    return { action, dashCard };
  }

  it("returns empty object if there are no parameter_mappings on the dashboard card", () => {
    const { action, dashCard } = setup({
      actionParameters: [WRITEBACK_PARAMETER],
      dashCardParameterMappings: [],
    });

    const result = turnDashCardParameterMappingsIntoClickBehaviorMappings(
      dashCard,
      [DASHBOARD_FILTER_PARAMETER],
      action,
    );

    expect(result).toEqual({});
  });

  it("returns empty object if there no parameters on the action", () => {
    const { action, dashCard } = setup({
      actionParameters: [],
      dashCardParameterMappings: [PARAMETER_MAPPING],
    });

    const result = turnDashCardParameterMappingsIntoClickBehaviorMappings(
      dashCard,
      [DASHBOARD_FILTER_PARAMETER],
      action,
    );

    expect(result).toEqual({});
  });

  it("returns empty object if dashboard parameters are unavailable", () => {
    const { action, dashCard } = setup({
      actionParameters: [WRITEBACK_PARAMETER],
      dashCardParameterMappings: [PARAMETER_MAPPING],
    });

    const result = turnDashCardParameterMappingsIntoClickBehaviorMappings(
      dashCard,
      [],
      action,
    );

    expect(result).toEqual({});
  });

  it("returns empty object if nothing is available", () => {
    const { action, dashCard } = setup({
      actionParameters: [],
      dashCardParameterMappings: [],
    });

    const result = turnDashCardParameterMappingsIntoClickBehaviorMappings(
      dashCard,
      [],
      action,
    );

    expect(result).toEqual({});
  });

  it("converts parameters correctly", () => {
    const { action, dashCard } = setup({
      actionParameters: [WRITEBACK_PARAMETER],
      dashCardParameterMappings: [PARAMETER_MAPPING],
    });

    const result = turnDashCardParameterMappingsIntoClickBehaviorMappings(
      dashCard,
      [DASHBOARD_FILTER_PARAMETER],
      action,
    );

    expect(result).toEqual(CLICK_BEHAVIOR_PARAMETER_MAPPINGS);
  });
});

describe("turnClickBehaviorParameterMappingsIntoDashCardMappings", () => {
  it("returns nothing if action parameters are empty", () => {
    const action = createMockQueryAction({ parameters: [] });

    const result = turnClickBehaviorParameterMappingsIntoDashCardMappings(
      CLICK_BEHAVIOR_PARAMETER_MAPPINGS,
      action,
    );

    expect(result).toEqual([]);
  });

  it("returns nothing if click behavior mappings are empty", () => {
    const action = createMockQueryAction({ parameters: [WRITEBACK_PARAMETER] });

    const result = turnClickBehaviorParameterMappingsIntoDashCardMappings(
      {},
      action,
    );

    expect(result).toEqual([]);
  });

  it("converts click behavior correctly", () => {
    const action = createMockQueryAction({ parameters: [WRITEBACK_PARAMETER] });

    const result = turnClickBehaviorParameterMappingsIntoDashCardMappings(
      CLICK_BEHAVIOR_PARAMETER_MAPPINGS,
      action,
    );

    expect(result).toEqual([PARAMETER_MAPPING]);
  });
});
