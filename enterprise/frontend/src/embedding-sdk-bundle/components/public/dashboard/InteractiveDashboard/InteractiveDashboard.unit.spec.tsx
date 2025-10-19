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
  it("should call onVisualizationChange when a card is opened", async () => {
    const onVisualizationChange = jest.fn();

    await setup({
      dashboardName: "Test dashboard",
      props: {
        onVisualizationChange,
      },
    });

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByLabelText("Back to Test dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByTestId("query-visualization-root")).toBeInTheDocument();

    expect(onVisualizationChange).toHaveBeenCalledTimes(1);
    expect(onVisualizationChange).toHaveBeenCalledWith("table");

    await userEvent.click(screen.getByText("Table"));
    await userEvent.click(screen.getByText("Bar"));

    expect(onVisualizationChange).toHaveBeenCalledTimes(2);
    expect(onVisualizationChange).toHaveBeenCalledWith("bar");
  });

  it("should allow users to click the dashcard title", async () => {
    await setup({
      dashboardName: "Test dashboard",
    });

    expect(screen.getByTestId("legend-label")).toHaveAttribute(
      "data-is-clickable",
      "true",
    );

    await userEvent.click(screen.getByTestId("legend-label"));

    expect(
      await screen.findByLabelText("Back to Test dashboard"),
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

    const ellipsisIcon = screen.queryByLabelText("ellipsis icon");
    expect(ellipsisIcon).toBeInTheDocument();
    await userEvent.click(ellipsisIcon!);
    await waitFor(() => {
      expect(screen.getByLabelText("Download results")).toBeInTheDocument();
    });
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

  it("should only show the download button if downloads are enabled", async () => {
    await setup({
      props: { withDownloads: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));

    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(1);

    expect(
      dashboardHeader.getByLabelText("Download as PDF"),
    ).toBeInTheDocument();
  });

  it("should not show buttons if downloads are disabled", async () => {
    await setup({
      props: { withDownloads: false },
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));

    expect(
      dashboardHeader.queryByTestId("dashboard-header-row-button"),
    ).not.toBeInTheDocument();
  });
});
