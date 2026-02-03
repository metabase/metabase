import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";

import type { SdkDashboardProps } from "../SdkDashboard";
import { SdkDashboard } from "../SdkDashboard";

import { TEST_DASHBOARD_ID, setupSdkDashboard } from "./setup";

const setup = async (
  options: {
    props?: Partial<SdkDashboardProps>;
    providerProps?: Partial<MetabaseProviderProps>;
    isLocaleLoading?: boolean;
    dashboardName?: string;
  } = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: SdkDashboard,
  });
};

describe("SdkDashboard", () => {
  it("should render a loader when a locale is loading", async () => {
    await setup({ isLocaleLoading: true });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render dashboard cards", async () => {
    await setup();

    expect(screen.getByText("Here is a card title")).toBeInTheDocument();
    expect(screen.getByText("Some card text")).toBeInTheDocument();
  });

  it("should allow to navigate to a question from dashboard", async () => {
    await setup();

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();
  });

  it("should allow to navigate back to dashboard from a question", async () => {
    await setup({ dashboardName: "Test dashboard" });

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Back to Test dashboard")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Back to Test dashboard"));

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    // do not reload dashboard data on navigate back
    expect(
      fetchMock.callHistory.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}`),
    ).toHaveLength(1);
  });

  it("should allow to navigate back to dashboard from a question with empty results", async () => {
    await setup({ dashboardName: "Test dashboard" });

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Back to Test dashboard")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Back to Test dashboard"));

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    // do not reload dashboard data on navigate back
    expect(
      fetchMock.callHistory.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}`),
    ).toHaveLength(1);
  });

  it("should support onLoad, onLoadWithoutCards handlers", async () => {
    const onLoad = jest.fn();
    const onLoadWithoutCards = jest.fn();
    const { dashboard } = await setup({
      props: { onLoad, onLoadWithoutCards },
    });

    expect(onLoadWithoutCards).toHaveBeenCalledTimes(1);
    expect(onLoadWithoutCards).toHaveBeenLastCalledWith(dashboard);

    await waitFor(() => {
      return fetchMock.callHistory.called(
        `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
      );
    });
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenLastCalledWith(dashboard);
  });

  it("should support global dashboard load event handlers", async () => {
    const onLoad = jest.fn();
    const onLoadWithoutCards = jest.fn();

    const { dashboard } = await setup({
      providerProps: {
        eventHandlers: {
          onDashboardLoad: onLoad,
          onDashboardLoadWithoutCards: onLoadWithoutCards,
        },
      },
    });

    expect(onLoadWithoutCards).toHaveBeenCalledTimes(1);
    expect(onLoadWithoutCards).toHaveBeenLastCalledWith(dashboard);

    await waitFor(() => {
      return fetchMock.callHistory.called(
        `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
      );
    });

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenLastCalledWith(dashboard);
  });

  it("should render a custom dashcard menu if one is provided with a user plugin", async () => {
    const onClickCustomAction = jest.fn();
    await setup({
      props: {
        withDownloads: true,
        plugins: {
          dashboard: {
            dashboardCardMenu: {
              withDownloads: true,
              withEditLink: true,
              customItems: [
                {
                  iconName: "chevronright",
                  label: "Custom Action",
                  onClick: onClickCustomAction,
                },
              ],
            },
          },
        },
      },
    });

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    const dashcard = screen.getAllByTestId("dashcard").at(0);
    expect(dashcard).toBeInTheDocument();

    await userEvent.click(within(dashcard!).getByTestId("dashcard-menu"));

    const dashcardMenuPopover = await screen.findByRole("menu");
    expect(
      within(dashcardMenuPopover).getByText("Download results"),
    ).toBeInTheDocument();
    expect(
      within(dashcardMenuPopover).getByText("Edit question"),
    ).toBeInTheDocument();
    expect(
      within(dashcardMenuPopover).getByText("Custom Action"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dashcardMenuPopover).getByText("Custom Action"),
    );

    expect(dashcardMenuPopover).not.toBeInTheDocument();
    expect(onClickCustomAction).toHaveBeenCalled();
  });
});
