import fetchMock from "fetch-mock";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { createMockMetadata } from "__support__/metadata";
import { setupModelPersistenceEndpoints } from "__support__/server-mocks/persist";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { ModelCacheRefreshStatus } from "metabase-types/api";
import { getMockModelCacheInfo } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { ModelCacheManagementSection } from "./ModelCacheManagementSection";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(ORDERS_ID));

type SetupOpts = Partial<ModelCacheRefreshStatus> & {
  waitForSectionAppearance?: boolean;
  canManageDB?: boolean;
};

async function setup({
  waitForSectionAppearance = true,
  canManageDB = true,
  ...cacheInfo
}: SetupOpts = {}) {
  const question = ordersTable.question();
  const model = question.setCard({
    ...question.card(),
    id: 1,
    name: "Order model",
    type: "model",
    can_manage_db: canManageDB,
  });

  const modelCacheInfo = getMockModelCacheInfo({
    ...cacheInfo,
    card_id: model.id(),
    card_name: model.displayName() as string,
  });

  setupModelPersistenceEndpoints([modelCacheInfo]);

  renderWithProviders(<ModelCacheManagementSection model={model} />);

  if (waitForSectionAppearance) {
    await screen.findByTestId("model-cache-section");
  }

  return {
    modelCacheInfo,
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
    expect(await screen.findByText("Create now")).toBeInTheDocument();
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
    await setup({
      state: "persisted",
    });
    fireEvent.click(await screen.findByLabelText("refresh icon"));

    // get, post, get
    await waitFor(() => expect(fetchMock.calls().length).toBe(3));
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
    await setup({ state: "error" });
    fireEvent.click(await screen.findByLabelText("refresh icon"));

    // get, post, get
    await waitFor(() => expect(fetchMock.calls().length).toBe(3));
  });

  it("disables refresh when DB management is not available to the user", async () => {
    await setup({ state: "persisted", canManageDB: false });
    expect(screen.queryByLabelText("refresh icon")).not.toBeInTheDocument();
  });
});
