import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../tests/setup";

import { EditableDashboard } from "./EditableDashboard";

const setup = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: EditableDashboard,
  });
};

describe("EditableDashboard", () => {
  it("should support dashboard editing", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const editButton = within(
      screen.getByTestId("dashboard-header"),
    ).getByLabelText(`pencil icon`);

    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);

    expect(
      screen.getByText("You're editing this dashboard."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should only show edit button, refresh, and fullscreen toggles when isFullscreen=false", async () => {
    await setup({ isFullscreen: false });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));
    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(3);

    expect(dashboardHeader.getByLabelText("Auto Refresh")).toBeInTheDocument();
    expect(
      dashboardHeader.getByLabelText("Edit dashboard"),
    ).toBeInTheDocument();
    expect(
      dashboardHeader.queryByLabelText("Nighttime mode"),
    ).not.toBeInTheDocument();

    expect(
      dashboardHeader.getByLabelText("Enter fullscreen"),
    ).toBeInTheDocument();
  });

  it("should only show refresh, nightmode, and fullscreen toggles when isFullscreen=true", async () => {
    await setup({ isFullscreen: true });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));
    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(3);

    expect(dashboardHeader.getByLabelText("Auto Refresh")).toBeInTheDocument();
    expect(
      dashboardHeader.queryByLabelText("Edit dashboard"),
    ).not.toBeInTheDocument();
    expect(
      dashboardHeader.getByLabelText("Nighttime mode"),
    ).toBeInTheDocument();

    expect(
      dashboardHeader.getByLabelText("Exit fullscreen"),
    ).toBeInTheDocument();
  });
});
