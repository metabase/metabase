import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { type SetupSdkDashboardProps, setupSdkDashboard } from "./setup";

const setup = async (options: SetupSdkDashboardProps = {}) =>
  setupSdkDashboard({
    props: {
      mode: "static",
      ...options.props,
    },
    providerProps: options.providerProps,
  });

describe("StaticDashboard", () => {
  it("shows a dashboard card question title by default", async () => {
    await setup();

    expect(screen.getByText("Here is a card title")).toBeInTheDocument();
  });

  it("hides the dashboard card question title when withCardTitle is false", async () => {
    await setup({ props: { withCardTitle: false } });

    expect(screen.queryByText("Here is a card title")).not.toBeInTheDocument();
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
});
