import {
  createMockCard,
  createMockDashboardCard,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardClickAction } from "../../visualizations/click-actions/actions/DashboardClickAction";
import { getClickBehavior } from "../../visualizations/click-actions/lib/dashboard-click-drill";

const rootClickBehavior = { type: "link", linkType: "url" };
const metricClickBehavior = { type: "actionMenu" };
const dimensionClickBehavior = { type: "crossfilter" };

const metricColumn = { name: "count" };
const dimensionColumn = { name: "CATEGORY" };

function buildSettings({ columns = {}, root } = {}) {
  const column_settings = Object.fromEntries(
    Object.entries(columns).map(([name, click_behavior]) => [
      JSON.stringify(["name", name]),
      { click_behavior },
    ]),
  );
  const settings = {
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

describe("DashboardClickAction", () => {
  it("creates a click-behavior action for the configured chart behavior", () => {
    const actions = DashboardClickAction({
      question: {},
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
      question: {},
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
