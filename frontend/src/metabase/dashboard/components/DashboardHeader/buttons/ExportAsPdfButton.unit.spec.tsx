import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { SelectedTabId } from "metabase/redux/store";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { ExportAsPdfButton } from "./ExportAsPdfButton";

jest.mock("metabase/visualizations/lib/save-dashboard-pdf", () => ({
  ...jest.requireActual("metabase/visualizations/lib/save-dashboard-pdf"),
  saveDashboardPdf: jest.fn(() => new Promise(() => {})),
}));

jest.mock("metabase/redux/analytics", () => ({
  ...jest.requireActual("metabase/redux/analytics"),
  trackExportDashboardToPDF: jest.fn(),
}));

const setup = ({
  dashboard = createMockDashboard({
    dashcards: [createMockDashboardCard()],
  }),
  selectedTabId = null,
}: {
  dashboard?: Dashboard;
  selectedTabId?: SelectedTabId;
} = {}) => {
  return renderWithProviders(
    <MockDashboardContext dashboardId={dashboard.id} dashboard={dashboard}>
      <ExportAsPdfButton />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          selectedTabId,
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [] },
          },
        }),
      },
    },
  );
};

describe("ExportAsPdfButton", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading indicator while the PDF is being generated", async () => {
    setup();

    const button = screen.getByTestId("export-as-pdf-button");
    expect(button).not.toHaveAttribute("data-loading", "true");
    expect(button).toBeEnabled();

    await userEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("data-loading", "true"));
    expect(button).toBeDisabled();
  });

  it("does not render when the dashboard is empty", () => {
    setup({ dashboard: createMockDashboard({ dashcards: [] }) });

    expect(
      screen.queryByTestId("export-as-pdf-button"),
    ).not.toBeInTheDocument();
  });

  describe("multi-tab dashboards", () => {
    const dashboard = createMockDashboard({
      tabs: [
        createMockDashboardTab({ id: 1 }),
        createMockDashboardTab({ id: 2 }),
      ],
      dashcards: [createMockDashboardCard({ dashboard_tab_id: 2 })],
    });

    it("does not render when the selected tab is empty", () => {
      setup({ dashboard, selectedTabId: 1 });

      expect(
        screen.queryByTestId("export-as-pdf-button"),
      ).not.toBeInTheDocument();
    });

    it("renders when the selected tab has cards", () => {
      setup({ dashboard, selectedTabId: 2 });

      expect(screen.getByTestId("export-as-pdf-button")).toBeEnabled();
    });
  });
});
