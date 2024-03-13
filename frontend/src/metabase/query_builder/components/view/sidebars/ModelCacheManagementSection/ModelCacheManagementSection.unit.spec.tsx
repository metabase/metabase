import fetchMock from "fetch-mock";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import PersistedModels from "metabase/entities/persisted-models";
import { checkNotNull } from "metabase/lib/types";
import type { ModelCacheRefreshStatus } from "metabase-types/api";
import { getMockModelCacheInfo } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import ModelCacheManagementSection from "./ModelCacheManagementSection";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(ORDERS_ID));

type SetupOpts = Partial<ModelCacheRefreshStatus> & {
  waitForSectionAppearance?: boolean;
};

async function setup({
  waitForSectionAppearance = true,
  ...cacheInfo
}: SetupOpts = {}) {
  const question = ordersTable.question();
  const model = question.setCard({
    ...question.card(),
    id: 1,
    name: "Order model",
    type: "model",
  });

  const modelCacheInfo = getMockModelCacheInfo({
    ...cacheInfo,
    card_id: model.id(),
    card_name: model.displayName() as string,
  });

  const onRefreshMock = jest
    .spyOn(PersistedModels.objectActions, "refreshCache")
    .mockReturnValue({ type: "__MOCK__" });

  fetchMock.get(`path:/api/persist/card/${model.id()}`, modelCacheInfo);

  if (!waitForSectionAppearance) {
    jest.spyOn(PersistedModels, "Loader").mockImplementation(props => {
      const { children } = props as any;
      return children({ persistedModel: cacheInfo });
    });
  }

  renderWithProviders(<ModelCacheManagementSection model={model} />);

  if (waitForSectionAppearance) {
    await screen.findByTestId("model-cache-section");
  }

  return {
    modelCacheInfo,
    onRefreshMock,
  };
}

describe("ModelCacheManagementSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("doesn't show up in 'off' state", async () => {
    await setup({ state: "off", waitForSectionAppearance: false });
    expect(screen.queryByTestId("model-cache-section")).not.toBeInTheDocument();
  });

  it("doesn't show up in 'deletable' state", async () => {
    await setup({ state: "deletable", waitForSectionAppearance: false });
    expect(screen.queryByTestId("model-cache-section")).not.toBeInTheDocument();
  });

  it("displays 'creating' state correctly", async () => {
    await setup({ state: "creating" });
    expect(
      await screen.findByText("Waiting to create the first model cache"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'refreshing' state correctly", async () => {
    await setup({ state: "refreshing" });
    expect(
      await screen.findByText("Refreshing model cache"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });

  it("displays 'persisted' state correctly", async () => {
    const { modelCacheInfo } = await setup({ state: "persisted" });
    const expectedTimestamp = moment(modelCacheInfo.refresh_end).fromNow();
    expect(
      await screen.findByText(`Model last cached ${expectedTimestamp}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("triggers refresh from 'persisted' state", async () => {
    const { modelCacheInfo, onRefreshMock } = await setup({
      state: "persisted",
    });
    fireEvent.click(await screen.findByLabelText("refresh icon"));
    expect(onRefreshMock).toHaveBeenCalledWith(modelCacheInfo);
  });

  it("displays 'error' state correctly", async () => {
    const { modelCacheInfo } = await setup({ state: "error" });
    const expectedTimestamp = moment(modelCacheInfo.refresh_end).fromNow();

    expect(
      await screen.findByText("Failed to update model cache"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Last attempt ${expectedTimestamp}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
  });

  it("triggers refresh from 'error' state", async () => {
    const { modelCacheInfo, onRefreshMock } = await setup({ state: "error" });
    fireEvent.click(await screen.findByLabelText("refresh icon"));
    expect(onRefreshMock).toHaveBeenCalledWith(modelCacheInfo);
  });
});
