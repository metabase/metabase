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
});

describe("DashboardClickAction", () => {
  it("creates a click-behavior action for the configured chart behavior", () => {
    const actions = DashboardClickAction({
      question: new Question(createMockCard()),
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

  it("returns no action when no click behavior is configured for the clicked target", () => {
    const actions = DashboardClickAction({
      question: new Question(createMockCard()),
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
