import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDataset,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DashboardChartSettings } from "./DashboardChartSettings";
import type { DashboardChartSettingsProps } from "./types";

registerVisualizations();

const DEFAULT_PROPS = {
  widgets: [],
  series: [
    {
      card: createMockCard({ visualization_settings: {} }),
      ...createMockDataset({ data: { rows: [], cols: [] } }),
    },
  ],
  settings: {},
};

type SetupOpts = Partial<DashboardChartSettingsProps>;

const setup = (props: SetupOpts) => {
  return renderWithProviders(
    <DashboardChartSettings {...DEFAULT_PROPS} {...props} />,
  );
};

describe("DashboardChartSettings", () => {
  it("reset settings should revert to the original card settings with click behavior", async () => {
    const onChange = jest.fn();

    const originalVizSettings = createMockVisualizationSettings({
      "graph.goal_value": 100,
      "graph.show_goal": true,
      "graph.goal_label": "foo",
    });

    const modifiedSettings = createMockVisualizationSettings({
      "graph.show_goal": false,
      "graph.goal_label": "bar",
      click_behavior: {
        type: "link",
        linkType: "url",
      },
    });

    setup({
      dashcard: createMockDashboardCard({
        card: createMockCard({ visualization_settings: originalVizSettings }),
      }),
      settings: modifiedSettings,
      widgets: [],
      onChange,
    });

    await userEvent.click(screen.getByText("Reset to defaults"));

    expect(onChange).toHaveBeenCalledWith({
      ...originalVizSettings,
      click_behavior: {
        type: "link",
        linkType: "url",
      },
    });
  });
});
