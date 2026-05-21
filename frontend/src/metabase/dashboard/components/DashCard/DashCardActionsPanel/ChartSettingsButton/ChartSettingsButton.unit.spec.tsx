import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ChartSettingsButton } from "metabase/dashboard/components/DashCard/DashCardActionsPanel/ChartSettingsButton/ChartSettingsButton";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerVisualization } from "metabase/visualizations";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import {
  createMockColumn,
  createMockDashboard,
  createMockDatabase,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

// @ts-expect-error: registerVisualization is not in TypeScript yet
registerVisualization(LineChart);

const rows = [["John", "John Smith Jr"]];
const MOCK_SERIES = [
  createMockSingleSeries(
    { display: "line" },
    {
      data: {
        rows,
        cols: [
          createMockColumn({
            base_type: "string",
            name: "Short name",
            display_name: "Short name",
          }),
          createMockColumn({
            base_type: "string",
            name: "Long name",
            display_name: "Long name",
            visibility_type: "normal",
          }),
        ],
      },
    },
  ),
];

const MOCK_DASHBOARD = createMockDashboard();
const MOCK_DATABASE = createMockDatabase();

const setup = () => {
  const onReplaceAllVisualizationSettings = jest.fn();

  setupDatabaseEndpoints(MOCK_DATABASE);

  renderWithProviders(
    <MockDashboardContext
      dashboardId={MOCK_DASHBOARD.id}
      dashboard={MOCK_DASHBOARD}
    >
      <ChartSettingsButton
        series={MOCK_SERIES}
        onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
      />
    </MockDashboardContext>,
  );
};

describe("ChartSettingsButton", () => {
  it("should render the button", () => {
    setup();
    expect(screen.getByLabelText("palette icon")).toBeInTheDocument();
  });

  it("should render the settings and visualization modal when the button is clicked", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("palette icon"));

    expect(
      await screen.findByTestId("chartsettings-sidebar"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("visualization-root")).toBeInTheDocument();

    await userEvent.click(screen.getByDisplayValue("Linear Interpolated"));

    //Select dropdowns render a listbox
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
