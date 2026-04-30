import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { createMockDashboard } from "metabase-types/api/mocks";

import { ExportAsPdfButton } from "./ExportAsPdfButton";

jest.mock("metabase/visualizations/lib/save-dashboard-pdf", () => ({
  saveDashboardPdf: jest.fn(() => new Promise(() => {})),
}));

jest.mock("metabase/dashboard/analytics", () => ({
  trackExportDashboardToPDF: jest.fn(),
}));

const setup = () => {
  const dashboard = createMockDashboard();

  return renderWithProviders(
    <MockDashboardContext dashboardId={dashboard.id} dashboard={dashboard}>
      <ExportAsPdfButton />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
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
});
