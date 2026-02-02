import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";

import { screen, waitFor, within } from "__support__/ui";
import type { SdkDashboardProps } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboard";

import { addEnterpriseSubscriptionsTests } from "../../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../../tests/setup";
import { StaticDashboard } from "../StaticDashboard";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const setupEnterprise = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    enterprisePlugins: ["sdk_notifications"],
    component: StaticDashboard as ComponentType<SdkDashboardProps>,
  });
};
console.warn = () => {};

describe("StaticDashboard", () => {
  addEnterpriseSubscriptionsTests(setupEnterprise);

  it("should not allow users to click the dashcard title", async () => {
    await setupEnterprise();

    expect(screen.getByTestId("legend-label")).toHaveAttribute(
      "data-is-clickable",
      "false",
    );

    await userEvent.click(screen.getByTestId("legend-label"));

    expect(
      screen.queryByTestId("query-visualization-root"),
    ).not.toBeInTheDocument();
  });

  it("should only show the download button in the dashcard when downloads are enabled", async () => {
    await setupEnterprise({
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
    await setupEnterprise({
      props: {
        withDownloads: false,
      },
    });

    expect(screen.queryByLabelText("Download results")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should only show the download button if downloads are enabled", async () => {
    await setupEnterprise({
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
    await setupEnterprise({
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

  it("should not show 'Add a chart' button on empty dashboards", async () => {
    await setupEnterprise({ dashcards: [] });

    expect(screen.getByText("This dashboard is empty")).toBeInTheDocument();
    expect(screen.queryByText("Add a chart")).not.toBeInTheDocument();
  });

  it("should not allow editing the dashboard title", async () => {
    await setupEnterprise();

    expect(screen.getByTestId("dashboard-name-heading")).toBeDisabled();
  });
});
