import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../tests/setup";

import { InteractiveDashboard } from "./InteractiveDashboard";

const setup = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: InteractiveDashboard,
  });
};

console.warn = () => {};

describe("InteractiveDashboard", () => {
  it("should allow users to click the dashcard title", async () => {
    await setup();

    expect(screen.getByTestId("legend-label")).toHaveAttribute(
      "data-is-clickable",
      "true",
    );

    await userEvent.click(screen.getByTestId("legend-label"));

    expect(
      await screen.findByLabelText("Back to Dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByTestId("query-visualization-root")).toBeInTheDocument();
  });

  it("should only show the download button in the dashcard when downloads are enabled", async () => {
    await setup({
      props: {
        withDownloads: true,
      },
    });

    expect(screen.getByLabelText("Download results")).toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should show no button in the dashcard when downloads are disabled", async () => {
    await setup({
      props: {
        withDownloads: false,
      },
    });

    expect(screen.queryByLabelText("Download results")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should only show refresh and fullscreen toggles when isFullscreen=false", async () => {
    await setup({ isFullscreen: false });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));
    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(2);

    expect(dashboardHeader.getByLabelText("Auto Refresh")).toBeInTheDocument();
    expect(
      dashboardHeader.queryByLabelText("Nighttime mode"),
    ).not.toBeInTheDocument();

    expect(
      dashboardHeader.getByLabelText("Enter fullscreen"),
    ).toBeInTheDocument();
  });

  it("should only show refresh, nightmode, and fullscreen toggles when isFullscreen=true", async () => {
    await setup({
      isFullscreen: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });
    const dashboardHeader = within(screen.getByTestId("dashboard-header"));
    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(3);

    expect(dashboardHeader.getByLabelText("Auto Refresh")).toBeInTheDocument();
    expect(
      dashboardHeader.getByLabelText("Nighttime mode"),
    ).toBeInTheDocument();
    expect(
      dashboardHeader.getByLabelText("Exit fullscreen"),
    ).toBeInTheDocument();
  });
});
