import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

const TEST_DASHBOARD_ID = 1;

describe("InteractiveDashboard", () => {
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
    await setup();

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Back to Dashboard")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Back to Dashboard"));

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    // do not reload dashboard data on navigate back
    expect(
      fetchMock.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}`),
    ).toHaveLength(1);
  });

  it("should allow to navigate back to dashboard from a question with empty results", async () => {
    await setup();

    await userEvent.click(screen.getByText("Here is a card title"));

    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Back to Dashboard")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Back to previous results"));

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    // do not reload dashboard data on navigate back
    expect(
      fetchMock.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}`),
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
      return fetchMock.called(
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
      return fetchMock.called(
        `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
      );
    });

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenLastCalledWith(dashboard);
  });

  describe("withFooter", () => {
    it("should hide the footer when withFooter=true", async () => {
      await setup({
        props: {
          withFooter: true,
        },
      });

      expect(screen.getByTestId("embed-frame-footer")).toBeInTheDocument();
      expect(
        screen.getAllByTestId("dashboard-header-row-button").length,
      ).toBeGreaterThan(0);
    });

    it("should hide the footer when withFooter=false", async () => {
      await setup({
        props: {
          withFooter: false,
        },
      });

      expect(
        screen.queryByTestId("embed-frame-footer"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryAllByTestId("dashboard-header-row-button").length,
      ).toBe(0);
    });
  });
});
