import { DashboardClickAction } from "./DashboardClickAction";
import { getClickBehavior } from "./dashboard-click-drill";

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
    // Computed column() does NOT surface click_behavior (#73448). Returning the
    // formatter-only shape mirrors the production behavior we have to handle.
    column: () => ({}),
  };
  if (root) {
    settings.click_behavior = root;
  }
  return settings;
}

describe("getClickBehavior", () => {
  it("uses click behavior configured on the clicked column", () => {
    const clickBehavior = getClickBehavior({
      column: metricColumn,
      settings: buildSettings({ columns: { count: metricClickBehavior } }),
    });

    expect(clickBehavior).toBe(metricClickBehavior);
  });

  it("falls back to the click behavior configured on a clicked dimension (#73448)", () => {
    const clickBehavior = getClickBehavior({
      column: metricColumn,
      dimensions: [{ column: dimensionColumn, value: "Gadget" }],
      settings: buildSettings({
        columns: { CATEGORY: dimensionClickBehavior },
      }),
    });

    expect(clickBehavior).toBe(dimensionClickBehavior);
  });

  it("prefers a clicked column behavior over a dimension behavior", () => {
    const clickBehavior = getClickBehavior({
      column: metricColumn,
      dimensions: [{ column: dimensionColumn, value: "Gadget" }],
      settings: buildSettings({
        columns: {
          count: metricClickBehavior,
          CATEGORY: dimensionClickBehavior,
        },
      }),
    });

    expect(clickBehavior).toBe(metricClickBehavior);
  });

  it("falls back to the root click behavior when neither column nor dimension has one", () => {
    const clickBehavior = getClickBehavior({
      column: metricColumn,
      dimensions: [{ column: dimensionColumn, value: "Gadget" }],
      settings: buildSettings({ root: rootClickBehavior }),
    });

    expect(clickBehavior).toBe(rootClickBehavior);
  });
});

describe("DashboardClickAction", () => {
  it("creates a click-behavior action for a chart click with a dimension-scoped behavior (#73448)", () => {
    const actions = DashboardClickAction({
      question: {},
      clicked: {
        column: metricColumn,
        dimensions: [{ column: dimensionColumn, value: "Gadget" }],
        extraData: { dashboard: {}, parameters: [] },
      },
      settings: buildSettings({
        columns: { CATEGORY: { type: "crossfilter", parameterMapping: {} } },
      }),
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

  describe("dashboard-filter action", () => {
    const PARAMETER_ID = "param123";
    const crossfilterClickBehavior = {
      type: "crossfilter",
      parameterMapping: {
        [PARAMETER_ID]: {
          id: PARAMETER_ID,
          source: { type: "column", id: "CATEGORY", name: "CATEGORY" },
          target: { type: "parameter", id: PARAMETER_ID },
        },
      },
    };

    function setup({ tableSettings = {} } = {}) {
      const setOrUnsetParameterValues = jest.fn(() => () => {});
      const setParameterValue = jest.fn((id, value) => ({ id, value }));
      const [action] = DashboardClickAction({
        question: {},
        clicked: {
          column: metricColumn,
          dimensions: [{ column: dimensionColumn, value: "Gadget" }],
          extraData: {
            dashboard: {},
            parameters: [],
            setOrUnsetParameterValues,
            setParameterValue,
          },
        },
        settings: {
          ...buildSettings({ columns: { count: crossfilterClickBehavior } }),
          ...tableSettings,
        },
      });
      return { action, setOrUnsetParameterValues, setParameterValue };
    }

    it("toggles the mapped parameter values on regular table clicks", () => {
      const { action, setOrUnsetParameterValues, setParameterValue } = setup();

      action.action();

      expect(setOrUnsetParameterValues).toHaveBeenCalledWith([
        [PARAMETER_ID, "Gadget"],
      ]);
      expect(setParameterValue).not.toHaveBeenCalled();
    });

    it("sets the mapped parameter values without toggling on pivoted table clicks (metabase#54560)", () => {
      const { action, setOrUnsetParameterValues, setParameterValue } = setup({
        tableSettings: { "table.pivot": true },
      });
      const dispatch = jest.fn();

      action.action()(dispatch);

      expect(setOrUnsetParameterValues).not.toHaveBeenCalled();
      expect(setParameterValue).toHaveBeenCalledWith(PARAMETER_ID, "Gadget");
      expect(dispatch).toHaveBeenCalledWith({
        id: PARAMETER_ID,
        value: "Gadget",
      });
    });
  });
});
