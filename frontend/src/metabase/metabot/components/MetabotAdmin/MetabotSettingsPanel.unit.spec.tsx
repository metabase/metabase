import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoints,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  FIXED_METABOT_ENTITY_IDS,
  FIXED_METABOT_IDS,
} from "metabase/metabot/constants";
import { reinitialize } from "metabase/plugins";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { MetabotId, MetabotInfo, RecentItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockMetabotInfo,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MetabotSettingsPanel } from "./MetabotSettingsPanel";

const defaultMetabots = [
  createMockMetabotInfo({
    id: FIXED_METABOT_IDS.DEFAULT,
    entity_id: FIXED_METABOT_ENTITY_IDS.DEFAULT,
  }),
  createMockMetabotInfo({
    id: FIXED_METABOT_IDS.EMBEDDED,
    name: "Embedded Metabot",
    entity_id: FIXED_METABOT_ENTITY_IDS.EMBEDDED,
    collection_id: 21,
  }),
];

const defaultSeedCollections = [
  createMockCollection({ id: "root", name: "Our Analytics" }),
  {
    id: 21,
    name: "Collection Two",
    model: "collection",
    can_write: true,
    collection_name: "Collection Two Prime",
    parent_collection: {
      id: 3,
      name: "Collection Beta Prime",
    },
  },
  {
    id: 31,
    name: "Collection Three",
    model: "collection",
    can_write: true,
    parent_collection: {
      id: 3,
      name: "Collection Delta Prime",
    },
  },
  {
    id: 32,
    name: "Collection Four",
    model: "collection",
    can_write: true,
    parent_collection: {
      id: 3,
      name: "Collection Sigma Prime",
    },
  },
];
const setup = async (
  initialPathParam: MetabotId = 1,
  metabots: MetabotInfo[] = defaultMetabots,
  seedCollections = defaultSeedCollections,
  settings = createMockSettings({ "llm-metabot-configured?": true }),
) => {
  mockGetBoundingClientRect();
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupMetabotsEndpoints(metabots);
  setupCollectionByIdEndpoint({
    collections: seedCollections.map((c: any) => ({ id: c.model_id, ...c })),
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionsEndpoints({ collections: [] });

  setupRecentViewsAndSelectionsEndpoints(seedCollections as RecentItem[]);
  setupUpdateSettingEndpoint();

  metabots.forEach((mb) =>
    setupMetabotPromptSuggestionsEndpoint({
      metabotId: mb.id,
      prompts: [],
      paginationContext: {
        offset: 0,
        limit: 10,
        total: 0,
      },
    }),
  );

  const metabot =
    metabots.find((mb) => mb.id === initialPathParam) ?? metabots[0];

  const view = renderWithProviders(<MetabotSettingsPanel metabot={metabot} />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByTestId("metabot-enabled-toggle");

  return view;
};

const enabledToggle = () => screen.findByTestId("metabot-enabled-toggle");

const getLastSettingUpdateCall = (settingKey: string) =>
  fetchMock.callHistory.lastCall(
    `path:/api/setting/${encodeURIComponent(settingKey)}`,
  );

const setupEmbeddingPlugin = () => {
  mockSettings({
    "token-features": createMockTokenFeatures({
      embedding_sdk: true,
    }),
  });
  setupEnterprisePlugins();
};

const setupContentVerificationPlugin = () => {
  mockSettings({
    "token-features": createMockTokenFeatures({
      content_verification: true,
    }),
  });
  setupEnterprisePlugins();
};

describe("MetabotSettingsPanel", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should render the default metabot settings", async () => {
    await setup();
    expect(screen.getByText("Enable Metabot")).toBeInTheDocument();
  });

  it("should toggle default metabot enabled state", async () => {
    await setup();

    expect(await screen.findByText("Enable Metabot")).toBeInTheDocument();
    expect(
      await screen.findByText(/Metabot is Metabase's AI assistant/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Metabot is enabled")).toBeInTheDocument();

    await userEvent.click(await enabledToggle());
    await waitForRequest(() => getLastSettingUpdateCall("metabot-enabled?"));
    const call = getLastSettingUpdateCall("metabot-enabled?");
    expect(call?.options?.body).toBe(JSON.stringify({ value: false }));
  });

  it("should show the default collection section title", async () => {
    await setup();
    expect(
      await screen.findByText(/Collection for natural language querying/),
    ).toBeInTheDocument();
  });

  it("should render a selected collection for embedded metabot", async () => {
    setupEmbeddingPlugin();
    await setup(FIXED_METABOT_IDS.EMBEDDED);
    expect(await screen.findByText("Collection Two")).toBeInTheDocument();
  });

  it("should render a root collection if collection_id is null for metabot", async () => {
    setupEmbeddingPlugin();
    await setup(FIXED_METABOT_IDS.EMBEDDED, [
      createMockMetabotInfo({
        id: FIXED_METABOT_IDS.EMBEDDED,
        name: "Embedded Metabot",
        entity_id: FIXED_METABOT_ENTITY_IDS.EMBEDDED,
        collection_id: null,
      }),
    ]);
    expect(await screen.findByText("Our Analytics")).toBeInTheDocument();
  });

  it("should change selected collection for embedded metabot", async () => {
    setupEmbeddingPlugin();
    await setup(FIXED_METABOT_IDS.EMBEDDED);

    expect(
      fetchMock.callHistory.calls(
        `path:/api/metabot/metabot/${FIXED_METABOT_IDS.EMBEDDED}/prompt-suggestions?limit=10&offset=0`,
      ).length,
    ).toEqual(1); // should have loaded prompt suggestions

    expect(await screen.findByText("Collection Two")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Pick a different collection"));

    await screen.findByText("Select a collection");
    await userEvent.click(await screen.findByText(/Recent items/));
    await waitForLoaderToBeRemoved();
    await userEvent.click(await screen.findByText(/Collection Three/));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts.length).toBe(1);
    });

    const puts = await findRequests("PUT");
    expect(puts[0].url).toMatch(
      new RegExp(`/api/metabot/metabot/${FIXED_METABOT_IDS.EMBEDDED}`),
    );
    expect(puts[0].body).toEqual({ collection_id: 31 });
  });

  it("should show special copy for embedded metabot", async () => {
    setupEmbeddingPlugin();
    await setup(FIXED_METABOT_IDS.EMBEDDED);

    expect(
      await screen.findByText(/embedding the metabot component/i),
    ).toBeInTheDocument();
  });

  it("should toggle embedded metabot enabled state", async () => {
    setupEmbeddingPlugin();
    await setup(FIXED_METABOT_IDS.EMBEDDED);

    // Shows title but NOT description for embedded
    expect(
      await screen.findByText("Enable Embedded Metabot"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Metabot is Metabase's AI assistant/),
    ).not.toBeInTheDocument();

    // Toggle calls correct setting
    await userEvent.click(await enabledToggle());
    await waitForRequest(() =>
      getLastSettingUpdateCall("embedded-metabot-enabled?"),
    );
    const call = getLastSettingUpdateCall("embedded-metabot-enabled?");
    expect(call?.options?.body).toBe(JSON.stringify({ value: false }));
  });

  it("should not show verification switch without content_verification feature", async () => {
    await setup();

    expect(screen.queryByText("Verified content")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Only use Verified content"),
    ).not.toBeInTheDocument();
  });

  it("should show verification switch with content_verification feature", async () => {
    setupContentVerificationPlugin();

    await setup();

    expect(await screen.findByText("Verified content")).toBeInTheDocument();
    expect(
      await screen.findByText("Only use Verified content"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("switch", {
        name: "Only use Verified content",
      }),
    ).toBeInTheDocument();
  });

  it("should allow enabling/disabling verified switch affecting use_verified_content", async () => {
    setupContentVerificationPlugin();

    await setup();

    const verifiedSwitch = await screen.findByRole("switch", {
      name: "Only use Verified content",
    });

    // Verify switch is initially unchecked (default metabot has use_verified_content: false)
    expect(verifiedSwitch).not.toBeChecked();

    // Click to enable
    await userEvent.click(verifiedSwitch);

    // Verify API call was made with correct payload
    await waitFor(async () => {
      const putRequests = await findRequests("PUT");
      expect(putRequests.length).toBe(1);
    });

    const putRequests = await findRequests("PUT");
    expect(putRequests[0].body).toEqual({ use_verified_content: true });
  });
});
