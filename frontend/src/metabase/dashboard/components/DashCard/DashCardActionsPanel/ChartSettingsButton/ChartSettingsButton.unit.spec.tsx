import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { ChartSettingsButton } from "metabase/dashboard/components/DashCard/DashCardActionsPanel/ChartSettingsButton/ChartSettingsButton";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DashCardSeries, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDashCardDataSeries,
  createMockDashboard,
  createMockDatabase,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

registerVisualizations();

const rows = [["John", "John Smith Jr"]];
const MOCK_SERIES = [
  createMockDashCardDataSeries(
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

const TABLE_SERIES = [
  createMockDashCardDataSeries(
    { display: "table", name: "Orders" },
    {
      data: {
        rows: [
          [1, 10],
          [2, 20],
        ],
        cols: [
          createMockNumericColumn({ name: "ID", display_name: "ID" }),
          createMockNumericColumn({
            name: "SUBTOTAL",
            display_name: "Subtotal",
          }),
        ],
      },
    },
  ),
];

const MOCK_DASHBOARD = createMockDashboard();
const MOCK_DATABASE = createMockDatabase();

type SetupOpts = {
  series?: DashCardSeries;
};

const setup = ({ series = MOCK_SERIES }: SetupOpts = {}) => {
  const onReplaceAllVisualizationSettings = jest.fn<
    void,
    [VisualizationSettings]
  >();

  setupDatabaseEndpoints(MOCK_DATABASE);

  renderWithProviders(
    <MockDashboardContext
      dashboardId={MOCK_DASHBOARD.id}
      dashboard={MOCK_DASHBOARD}
    >
      <ChartSettingsButton
        series={series}
        onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
      />
    </MockDashboardContext>,
  );

  return { onReplaceAllVisualizationSettings };
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

  it("should preview a mini bar chart when it is enabled for a column (metabase#30966)", async () => {
    mockGetBoundingClientRect();
    setup({ series: TABLE_SERIES });
    await userEvent.click(screen.getByLabelText("palette icon"));
    await userEvent.click(
      await screen.findByTestId("Subtotal-settings-button"),
    );

    const checkbox = await screen.findByLabelText("Show a mini bar chart");
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByTestId("mini-bar-container")).not.toBeInTheDocument();

    await userEvent.click(checkbox);

    expect(screen.getByLabelText("Show a mini bar chart")).toBeChecked();
    expect(
      within(screen.getByTestId("visualization-root")).getAllByTestId(
        "mini-bar-container",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("should allow an empty card title (metabase#12013)", async () => {
    const { onReplaceAllVisualizationSettings } = setup({
      series: TABLE_SERIES,
    });
    await userEvent.click(screen.getByLabelText("palette icon"));

    await userEvent.clear(await screen.findByDisplayValue("Orders"));
    await userEvent.tab();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onReplaceAllVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onReplaceAllVisualizationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ "card.title": "" }),
    );
  });
});
