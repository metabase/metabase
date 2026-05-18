import type { WithRouterProps } from "react-router";

import {
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";

import { ArchiveDashboardModalConnectedInner } from "./ArchiveDashboardModal";

const TEST_DASHBOARD = createMockDashboard({ id: 1, name: "Sales overview" });

const setup = ({
  slug = "1-sales-overview",
  onClose = jest.fn(),
}: {
  slug?: string;
  onClose?: () => void;
} = {}) => {
  const props = {
    onClose,
    params: { slug },
  } as unknown as WithRouterProps & { onClose: () => void };

  renderWithProviders(<ArchiveDashboardModalConnectedInner {...props} />);

  return { onClose };
};

describe("ArchiveDashboardModalConnected", () => {
  it("fetches the dashboard from the slug and renders the archive modal", async () => {
    setupDashboardEndpoints(TEST_DASHBOARD);

    setup();

    expect(
      await screen.findByText("Move this dashboard to trash?"),
    ).toBeInTheDocument();
  });

  it("shows a loading spinner while the dashboard is loading", () => {
    setupDashboardEndpoints(TEST_DASHBOARD);

    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(
      screen.queryByText("Move this dashboard to trash?"),
    ).not.toBeInTheDocument();
  });

  it("shows an error and does not render the modal when the dashboard cannot be found", async () => {
    setupDashboardNotFoundEndpoint(TEST_DASHBOARD);

    setup();

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(
      screen.queryByText("Move this dashboard to trash?"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the slug has no id", () => {
    setup({ slug: "" });

    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Move this dashboard to trash?"),
    ).not.toBeInTheDocument();
  });
});
