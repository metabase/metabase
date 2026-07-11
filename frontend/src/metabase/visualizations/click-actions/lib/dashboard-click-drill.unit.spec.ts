import {
  createMockColumn,
  createMockDashboard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { getParameterValuesBySlug } from "./dashboard-click-drill";

const TARGET_DASHBOARD_ID = 20;

const emptyData = {
  column: {},
  parameter: {},
  parameterBySlug: {},
  parameterByName: {},
  userAttribute: {},
};

describe("getParameterValuesBySlug", () => {
  it("maps a mapping onto its target parameter's slug when the filter still exists", () => {
    const clickBehavior = {
      type: "link" as const,
      linkType: "dashboard" as const,
      targetId: TARGET_DASHBOARD_ID,
    };
    const extraData = {
      dashboards: {
        [TARGET_DASHBOARD_ID]: createMockDashboard({
          id: TARGET_DASHBOARD_ID,
          parameters: [
            createMockParameter({
              id: "param1",
              slug: "text_filter",
              type: "string/=",
            }),
          ],
        }),
      },
    };
    const data = {
      ...emptyData,
      column: {
        category: {
          value: "Widget",
          column: createMockColumn({ effective_type: "type/Text" }),
        },
      },
    };
    const parameterMapping = {
      param1: {
        id: "param1",
        source: { type: "column", id: "CATEGORY", name: "Category" },
        target: { type: "parameter", id: "param1" },
      },
    };

    expect(
      getParameterValuesBySlug(parameterMapping, {
        data,
        extraData,
        clickBehavior,
      }),
    ).toEqual({ text_filter: "Widget" });
  });

  it("drops mappings whose target filter was removed instead of emitting an `undefined` key (metabase#35444)", () => {
    const clickBehavior = {
      type: "link" as const,
      linkType: "dashboard" as const,
      targetId: TARGET_DASHBOARD_ID,
    };
    // the target dashboard no longer has the parameter the mapping points at
    const extraData = {
      dashboards: {
        [TARGET_DASHBOARD_ID]: createMockDashboard({
          id: TARGET_DASHBOARD_ID,
          parameters: [],
        }),
      },
    };
    const data = {
      ...emptyData,
      column: {
        count: {
          value: 5,
          column: createMockColumn({ effective_type: "type/Integer" }),
        },
      },
    };
    const parameterMapping = {
      removed_param: {
        id: "removed_param",
        source: { type: "column", id: "COUNT", name: "Count" },
        target: { type: "parameter", id: "removed_param" },
      },
    };

    const result = getParameterValuesBySlug(parameterMapping, {
      data,
      extraData,
      clickBehavior,
    });

    expect(result).toEqual({});
    expect(Object.keys(result)).not.toContain("undefined");
  });
});
