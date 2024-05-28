import { renderWithProviders, screen } from "__support__/ui";
import PersistedModels from "metabase/entities/persisted-models";
import type { ModelCacheRefreshStatus } from "metabase-types/api";
import { getMockModelCacheInfo } from "metabase-types/api/mocks/models";

import ModelCacheRefreshJobs from "./ModelCacheRefreshJobs";

async function setup({ logs = [] }: { logs?: ModelCacheRefreshStatus[] } = {}) {
  const onRefreshMock = jest
    .spyOn(PersistedModels.objectActions, "refreshCache")
    .mockReturnValue({ type: "__MOCK__" });

  jest.spyOn(PersistedModels, "ListLoader").mockImplementation(props => {
    const { children } = props as any;
    return children({
      persistedModels: logs,
      metadata: {
        limit: 20,
        offset: 0,
        total: logs.length,
      },
    });
  });

  renderWithProviders(
    <ModelCacheRefreshJobs>
      <></>
    </ModelCacheRefreshJobs>,
  );

  await screen.findByTestId("model-cache-logs");

  return {
    onRefreshMock,
  };
}

describe("ModelCacheRefreshJobs", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows empty state when there are no cache logs", async () => {
    await setup({ logs: [] });
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(document.querySelector("table")).not.toBeInTheDocument();
  });

  it("shows empty state when all logs are in 'deletable' state", async () => {
    await setup({
      logs: [
        getMockModelCacheInfo({ id: 1, card_id: 1, state: "deletable" }),
        getMockModelCacheInfo({ id: 2, card_id: 2, state: "deletable" }),
      ],
    });
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(document.querySelector("table")).not.toBeInTheDocument();
  });

  it("shows model and collection names", async () => {
    const info = getMockModelCacheInfo({
      collection_name: "Growth",
      card_name: "Customer",
    });

    await setup({ logs: [info] });

    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
  });

  it("handles models in root collections", async () => {
    const info = getMockModelCacheInfo({
      collection_id: "root",
      collection_name: undefined,
    });
    await setup({ logs: [info] });
    expect(screen.getByText("Our analytics")).toBeInTheDocument();
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
    expect(screen.queryByText("DELETABLE")).not.toBeInTheDocument();
  });

  it("displays 'off' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "off" })] });
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'creating' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "creating" })] });
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'refreshing' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "refreshing" })] });
    expect(screen.getByText("Refreshing")).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'persisted' state correctly", async () => {
    await setup({ logs: [getMockModelCacheInfo({ state: "persisted" })] });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("displays 'error' state correctly", async () => {
    await setup({
      logs: [getMockModelCacheInfo({ state: "error", error: "FOO BAR ERROR" })],
    });
    expect(screen.getByText("FOO BAR ERROR")).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });
});
