import { createMockMetadata } from "__support__/metadata";
import { selectTab } from "metabase/redux/dashboard";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type { ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardClickAction } from "./DashboardClickAction";
import {
  getClickBehavior,
  getDashboardDrillLinkUrl,
  getDashboardDrillParameters,
  getDashboardDrillTab,
  getDashboardDrillType,
  getDashboardDrillUrl,
} from "./dashboard-click-drill";

const rootClickBehavior: ClickBehavior = {
  type: "link",
  linkType: "url",
  linkTemplate: "",
};
const metricClickBehavior: ClickBehavior = { type: "actionMenu" };
const dimensionClickBehavior: ClickBehavior = { type: "crossfilter" };

const metricColumn = createMockColumn({ name: "count" });
const dimensionColumn = createMockColumn({ name: "CATEGORY" });

function buildSettings({
  columns = {},
  root,
}: {
  columns?: Record<string, ClickBehavior>;
  root?: ClickBehavior;
} = {}): ComputedVisualizationSettings {
  const column_settings = Object.fromEntries(
    Object.entries(columns).map(([name, click_behavior]) => [
      JSON.stringify(["name", name]),
      { click_behavior },
    ]),
  );
  const settings: ComputedVisualizationSettings = {
    column_settings,
    column: ({ name }) => ({ click_behavior: columns[name] }),
  };
  if (root) {
    settings.click_behavior = root;
  }
  return settings;
}

describe("getClickBehavior", () => {
  it("does not inherit another table column's click behavior through row dimensions (#82956)", () => {
    const clickBehavior = getClickBehavior({
      column: metricColumn,
      dimensions: [{ column: dimensionColumn, value: "Gadget" }],
      settings: buildSettings({
        columns: { CATEGORY: dimensionClickBehavior },
      }),
      extraData: { dashcard: createMockDashboardCard() },
    });

    expect(clickBehavior).toBeUndefined();
  });

  it.each([
    { description: "explicit", behavior: rootClickBehavior },
    { description: "default", behavior: undefined },
  ])(
    "uses the chart's $description behavior instead of retained table column actions (#73448)",
    ({ behavior }) => {
      const clickBehavior = getClickBehavior({
        column: metricColumn,
        dimensions: [{ column: dimensionColumn, value: "Gadget" }],
        extraData: {
          dashcard: createMockVisualizerDashboardCard({
            card: createMockCard({ display: "table" }),
            visualization_settings: {
              visualization: {
                display: "bar",
                settings: {},
                columnValuesMapping: {},
              },
            },
          }),
        },
        settings: {
          ...buildSettings({
            root: behavior,
            columns: {
              count: metricClickBehavior,
              CATEGORY: dimensionClickBehavior,
            },
          }),
          // Charts' computed column settings do not expose retained table click actions.
          column: () => ({}),
        },
      });

      expect(clickBehavior).toBe(behavior);
    },
  );

  it.each([
    { description: "configured", behavior: metricClickBehavior },
    { description: "default", behavior: undefined },
  ])(
    "uses only the table column's $description behavior when a card action remains",
    ({ behavior }) => {
      const clickBehavior = getClickBehavior({
        column: metricColumn,
        dimensions: [{ column: dimensionColumn, value: "Gadget" }],
        extraData: { dashcard: createMockDashboardCard() },
        settings: {
          ...buildSettings({ root: rootClickBehavior }),
          column: () => ({ click_behavior: behavior }),
        },
      });

      expect(clickBehavior).toBe(behavior);
    },
  );
});

const stateColumn = createMockColumn({ name: "STATE" });

const createdAtMonthColumn = createMockColumn({
  name: "CREATED_AT",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  unit: "month",
});

const targetDashboard = createMockDashboard({
  id: 2,
  parameters: [
    createMockParameter({
      id: "target-param",
      name: "State",
      slug: "state",
      type: "category",
    }),
    createMockParameter({
      id: "size-param",
      name: "Size",
      slug: "size",
      type: "category",
      default: "L",
    }),
  ],
});

const dashboardLink: ClickBehavior = {
  type: "link",
  linkType: "dashboard",
  targetId: 2,
  tabId: 7,
  parameterMapping: {
    "target-param": {
      id: "target-param",
      source: { type: "column", id: "STATE", name: "State" },
      target: { type: "parameter", id: "target-param" },
    },
  },
};

const drillExtraData = {
  dashboard: createMockDashboard({ id: 1 }),
  dashboards: { 2: targetDashboard },
  questions: { 5: createMockCard({ id: 5 }) },
  parameters: [],
};

describe("getDashboardDrillType", () => {
  it("resolves a URL link", () => {
    const type = getDashboardDrillType({
      settings: buildSettings({
        root: { type: "link", linkType: "url", linkTemplate: "https://x" },
      }),
    });

    expect(type).toBe("link-url");
  });

  it("resolves a link to another dashboard", () => {
    const type = getDashboardDrillType({
      settings: buildSettings({ root: dashboardLink }),
      extraData: drillExtraData,
    });

    expect(type).toBe("dashboard-url");
  });

  it("resolves a link to the current dashboard as a reset", () => {
    const type = getDashboardDrillType({
      settings: buildSettings({
        root: {
          type: "link",
          linkType: "dashboard",
          targetId: 1,
          parameterMapping: {},
        },
      }),
      extraData: {
        dashboard: createMockDashboard({ id: 1 }),
        dashboards: { 1: createMockDashboard({ id: 1 }) },
      },
    });

    expect(type).toBe("dashboard-reset");
  });

  it("resolves a question link", () => {
    const type = getDashboardDrillType({
      settings: buildSettings({
        root: {
          type: "link",
          linkType: "question",
          targetId: 5,
          parameterMapping: {},
        },
      }),
      extraData: drillExtraData,
    });

    expect(type).toBe("question-url");
  });

  it("resolves no drill when the link target is not loaded in extraData", () => {
    const type = getDashboardDrillType({
      settings: buildSettings({ root: dashboardLink }),
      extraData: { dashboard: createMockDashboard({ id: 1 }) },
    });

    expect(type).toBeNull();
  });

  it("resolves no drill when the question link target is not loaded in extraData", () => {
    // Static embedding loads no link targets, so these links must not open
    const type = getDashboardDrillType({
      settings: buildSettings({
        root: {
          type: "link",
          linkType: "question",
          targetId: 5,
          parameterMapping: {},
        },
      }),
      extraData: { dashboard: createMockDashboard({ id: 1 }), questions: {} },
    });

    expect(type).toBeNull();
  });
});

describe("getDashboardDrillTab", () => {
  it("returns the tab targeted by a dashboard link", () => {
    const tabId = getDashboardDrillTab({
      settings: buildSettings({ root: dashboardLink }),
      extraData: drillExtraData,
    });

    expect(tabId).toBe(7);
  });
});

describe("getDashboardDrillParameters", () => {
  it("pairs mapped parameter ids with clicked values", () => {
    const pairs = getDashboardDrillParameters({
      settings: buildSettings({
        root: {
          type: "crossfilter",
          parameterMapping: {
            "current-param": {
              id: "current-param",
              source: { type: "column", id: "STATE", name: "State" },
              target: { type: "parameter", id: "current-param" },
            },
          },
        },
      }),
      data: [{ col: stateColumn, value: "CA" }],
      extraData: {
        dashboard: createMockDashboard({ id: 1 }),
        parameters: [
          createMockParameter({
            id: "current-param",
            name: "State",
            slug: "state",
            type: "category",
          }),
        ],
      },
    });

    expect(pairs).toEqual([["current-param", "CA"]]);
  });

  it("updates every mapped filter at once, formatting each value for its parameter", () => {
    const pairs = getDashboardDrillParameters({
      settings: buildSettings({
        root: {
          type: "crossfilter",
          parameterMapping: {
            "text-param": {
              id: "text-param",
              source: { type: "column", id: "count", name: "Count" },
              target: { type: "parameter", id: "text-param" },
            },
            "date-param": {
              id: "date-param",
              source: {
                type: "column",
                id: "CREATED_AT",
                name: "Created At: Month",
              },
              target: { type: "parameter", id: "date-param" },
            },
          },
        },
      }),
      data: [
        { col: createMockColumn({ name: "count" }), value: 64 },
        {
          col: createdAtMonthColumn,
          value: "2025-07-01T00:00:00Z",
        },
      ],
      extraData: {
        dashboard: createMockDashboard({ id: 1 }),
        parameters: [
          createMockParameter({
            id: "text-param",
            slug: "filter-text",
            type: "string/=",
          }),
          createMockParameter({
            id: "date-param",
            slug: "filter-time",
            type: "date/month-year",
          }),
        ],
      },
    });

    expect(pairs).toEqual([
      ["text-param", 64],
      ["date-param", "2025-07"],
    ]);
  });
});

describe("getDashboardDrillUrl", () => {
  it("builds the target dashboard URL with defaults, mapped values, and tab", () => {
    const url = getDashboardDrillUrl({
      settings: buildSettings({ root: dashboardLink }),
      data: [{ col: stateColumn, value: "CA" }],
      extraData: drillExtraData,
    });

    expect(url).toBe("/dashboard/2?state=CA&size=L&tab=7");
  });

  it("uses the tab of the clicked table dashcard's column click behavior (metabase#34447)", () => {
    const tableDashcard = createMockDashboardCard({
      card: createMockCard({ display: "table" }),
    });
    const productIdColumn = createMockColumn({ name: "PRODUCT_ID" });
    const getUrlForTab = (tabId: number) =>
      getDashboardDrillUrl({
        column: productIdColumn,
        settings: buildSettings({
          columns: {
            PRODUCT_ID: {
              type: "link",
              linkType: "dashboard",
              targetId: 3,
              tabId,
              parameterMapping: {},
            },
          },
        }),
        data: [{ col: productIdColumn, value: 14 }],
        extraData: {
          dashboard: createMockDashboard({ id: 1 }),
          dashcard: tableDashcard,
          dashboards: { 3: createMockDashboard({ id: 3, parameters: [] }) },
        },
      });

    expect(getUrlForTab(11)).toBe("/dashboard/3?tab=11");
    expect(getUrlForTab(12)).toBe("/dashboard/3?tab=12");
  });
});

describe("getDashboardDrillLinkUrl", () => {
  it("renders the link template with clicked values", () => {
    const url = getDashboardDrillLinkUrl({
      settings: buildSettings({
        root: {
          type: "link",
          linkType: "url",
          linkTemplate: "https://metabase.test/{{count}}",
        },
      }),
      data: [{ col: createMockColumn({ name: "count" }), value: 42 }],
    });

    expect(url).toBe("https://metabase.test/42");
  });

  it("fills dashboard filter values and clicked column values into the link template", () => {
    const url = getDashboardDrillLinkUrl({
      settings: buildSettings({
        root: {
          type: "link",
          linkType: "url",
          linkTemplate:
            "https://metabase.com/{{filter-text}}/{{count}}/{{CREATED_AT}}",
        },
      }),
      data: [
        { col: createdAtMonthColumn, value: "2026-10-01T00:00:00Z" },
        { col: createMockColumn({ name: "count" }), value: 1 },
      ],
      extraData: {
        dashboard: createMockDashboard({
          parameters: [
            createMockParameter({
              id: "text-param",
              name: "Text filter",
              slug: "filter-text",
            }),
          ],
        }),
        parameterValuesBySlug: { "filter-text": "Dell Adams" },
      },
    });

    expect(url).toBe("https://metabase.com/Dell%20Adams/1/2026-10");
  });
});

describe("DashboardClickAction", () => {
  it("creates a click-behavior action for the configured chart behavior", () => {
    const actions = DashboardClickAction({
      question: new Question(createMockCard(), createMockMetadata()),
      clicked: {
        column: metricColumn,
        dimensions: [{ column: dimensionColumn, value: "Gadget" }],
        extraData: { dashboard: {}, parameters: [] },
        settings: buildSettings({
          root: { type: "crossfilter", parameterMapping: {} },
        }),
      },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      name: "click_behavior",
      defaultAlways: true,
    });
  });

  it("switches the tab and sets mapped filters when linking to the same dashboard (metabase#39319)", () => {
    const setParameterValue = jest.fn((id: string, value: unknown) => ({
      type: "set-parameter-value",
      payload: { id, value },
    }));
    const userIdColumn = createMockColumn({ name: "USER_ID" });
    const [action] = DashboardClickAction({
      question: new Question(createMockCard(), createMockMetadata()),
      clicked: {
        column: userIdColumn,
        data: [{ col: userIdColumn, value: 1 }],
        settings: buildSettings({
          root: {
            type: "link",
            linkType: "dashboard",
            targetId: 1,
            tabId: 2,
            parameterMapping: {
              "text-param": {
                id: "text-param",
                source: { type: "column", id: "USER_ID", name: "User ID" },
                target: { type: "parameter", id: "text-param" },
              },
            },
          },
        }),
        extraData: {
          dashboard: createMockDashboard({ id: 1 }),
          dashboards: { 1: createMockDashboard({ id: 1 }) },
          parameters: [
            createMockParameter({ id: "text-param", type: "string/contains" }),
          ],
          setParameterValue,
        },
      },
    });
    const dispatch = jest.fn();

    expect(action).toHaveProperty("action");
    if (!("action" in action)) {
      return;
    }
    const thunk = action.action();
    expect(typeof thunk).toBe("function");
    if (typeof thunk === "function") {
      thunk(dispatch, jest.fn());
    }

    expect(dispatch.mock.calls).toEqual([
      [selectTab({ tabId: 2 })],
      [
        {
          type: "set-parameter-value",
          payload: { id: "text-param", value: 1 },
        },
      ],
    ]);
  });

  it("returns no action when no click behavior is configured for the clicked target", () => {
    const actions = DashboardClickAction({
      question: new Question(createMockCard(), createMockMetadata()),
      clicked: {
        column: metricColumn,
        dimensions: [{ column: dimensionColumn, value: "Gadget" }],
        extraData: { dashboard: {}, parameters: [] },
      },
      settings: buildSettings(),
    });

    expect(actions).toHaveLength(0);
  });
});
