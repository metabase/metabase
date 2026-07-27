import userEvent from "@testing-library/user-event";

import { setupModelPersistenceEndpoints } from "__support__/server-mocks/persist";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { ModelCacheRefreshStatus } from "metabase-types/api";
import { getMockModelCacheInfo } from "metabase-types/api/mocks/models";

import { ModelCacheRefreshJobs } from "./ModelCacheRefreshJobs";

async function setup({ logs = [] }: { logs?: ModelCacheRefreshStatus[] } = {}) {
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupModelPersistenceEndpoints(logs);

  renderWithProviders(<ModelCacheRefreshJobs />);

  await screen.findByTestId("model-cache-logs");
}

describe("ModelCacheRefreshJobs", () => {
  it("shows empty state when there are no cache logs", async () => {
    await setup({ logs: [] });
    expect(await screen.findByText("No log entries")).toBeInTheDocument();
    expect(screen.queryByTestId("model-cache-log-row")).not.toBeInTheDocument();
  });

  it("shows empty state when all logs are in 'deletable' state", async () => {
    await setup({
      logs: [
        getMockModelCacheInfo({ id: 1, card_id: 1, state: "deletable" }),
        getMockModelCacheInfo({ id: 2, card_id: 2, state: "deletable" }),
      ],
    });
    expect(await screen.findByText("No log entries")).toBeInTheDocument();
    expect(screen.queryByTestId("model-cache-log-row")).not.toBeInTheDocument();
  });

  it("shows model and collection names", async () => {
    const info = getMockModelCacheInfo({
      collection_name: "Growth",
      card_name: "Customer",
    });

    await setup({ logs: [info] });

    expect(await screen.findByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
  });

  it("handles models in root collections", async () => {
    const info = getMockModelCacheInfo({
      collection_id: "root",
      collection_name: undefined,
    });
    await setup({ logs: [info] });
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
  });

  it("doesn't show records in 'deletable' state", async () => {
    await setup({
      logs: [
        getMockModelCacheInfo({
          id: 1,
          card_id: 1,
          card_name: "DELETABLE",
          state: "deletable",
        }),
        getMockModelCacheInfo({ id: 2, card_id: 2, state: "persisted" }),
      ],
    });
    expect(
      await screen.findByTestId("model-cache-log-row"),
    ).toBeInTheDocument();
    expect(screen.queryByText("DELETABLE")).not.toBeInTheDocument();
  });

  it("displays 'off' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "off" })] });
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'creating' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "creating" })] });
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("displays 'refreshing' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "refreshing" })] });
    expect(await screen.findByText("Refreshing")).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'persisted' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "persisted" })] });
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("displays 'error' state correctly", async () => {
    await setup({
      logs: [getMockModelCacheInfo({ state: "error", error: "FOO BAR ERROR" })],
    });
    expect(await screen.findByText("FOO BAR ERROR")).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("sorts client-side by Model when its header is clicked", async () => {
    await setup({
      logs: [
        getMockModelCacheInfo({ id: 1, card_id: 1, card_name: "Zebra" }),
        getMockModelCacheInfo({ id: 2, card_id: 2, card_name: "Apple" }),
      ],
    });

    const getRows = () => screen.getAllByTestId("model-cache-log-row");
    await screen.findAllByTestId("model-cache-log-row");
    expect(getRows()[0]).toHaveTextContent("Zebra");
    expect(getRows()[1]).toHaveTextContent("Apple");

    await userEvent.click(screen.getByRole("columnheader", { name: /Model/ }));

    expect(getRows()[0]).toHaveTextContent("Apple");
    expect(getRows()[1]).toHaveTextContent("Zebra");
  });

  it("sorts client-side by Collection when its header is clicked", async () => {
    await setup({
      logs: [
        getMockModelCacheInfo({ id: 1, card_id: 1, collection_name: "Zeta" }),
        getMockModelCacheInfo({ id: 2, card_id: 2, collection_name: "Alpha" }),
      ],
    });

    const getRows = () => screen.getAllByTestId("model-cache-log-row");
    await screen.findAllByTestId("model-cache-log-row");
    expect(getRows()[0]).toHaveTextContent("Zeta");
    expect(getRows()[1]).toHaveTextContent("Alpha");

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Collection/ }),
    );

    expect(getRows()[0]).toHaveTextContent("Alpha");
    expect(getRows()[1]).toHaveTextContent("Zeta");
  });
});
