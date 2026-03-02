import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoints,
} from "__support__/server-mocks/metabot";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  FIXED_METABOT_ENTITY_IDS,
  FIXED_METABOT_IDS,
} from "metabase-enterprise/metabot/constants";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { MetabotId, RecentItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockMetabotInfo,
} from "metabase-types/api/mocks";

import { MetabotAdminPage } from "./MetabotAdminPage";
import * as hooks from "./utils";

jest.mock("metabase-enterprise/settings");
const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const mockPathParam = (id: MetabotId) => {
  jest.spyOn(hooks, "useMetabotIdPath").mockReturnValue(id);
};

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
  metabots = defaultMetabots,
  seedCollections = defaultSeedCollections,
  error = false,
) => {
  mockGetBoundingClientRect();
  mockPathParam(initialPathParam);
  setupMetabotsEndpoints(metabots, error ? 500 : undefined);
  setupCollectionByIdEndpoint({
    collections: seedCollections.map((c: any) => ({ id: c.model_id, ...c })),
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionsEndpoints({ collections: [] });

  setupRecentViewsAndSelectionsEndpoints(seedCollections as RecentItem[]);

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

  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotAdminPage} />,
    {
      withRouter: true,
      initialRoute: `/admin/metabot/${initialPathParam}`,
    },
  );

  if (!error) {
    await screen.findByText(/Configure/);
  }
};

describe("MetabotAdminPage", () => {
  it("should render the page", async () => {
    await setup();
    expect(screen.getByText(/Configure Metabot/)).toBeInTheDocument();
  });

  it("should render the metabots list", async () => {
    await setup();
    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(screen.getByText("Embedded Metabot")).toBeInTheDocument();
  });

  it("should show collection picker for default metabot with NLQ title", async () => {
    await setup();
    expect(await screen.findByText("Configure Metabot")).toBeInTheDocument();
    expect(
      await screen.findByText(/Collection for natural language querying/),
    ).toBeInTheDocument();
  });

  it("should render a selected collection for embedded metabot", async () => {
    await setup(FIXED_METABOT_IDS.EMBEDDED);
    expect(await screen.findByText("Collection Two")).toBeInTheDocument();
  });

  it("should render a root collection if collection_id is null for metabot", async () => {
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

  it("should be able to switch between metabots", async () => {
    await setup(FIXED_METABOT_IDS.DEFAULT);
    expect(await screen.findByText("Configure Metabot")).toBeInTheDocument();

    mockPathParam(FIXED_METABOT_IDS.EMBEDDED);
    await userEvent.click(await screen.findByText("Embedded Metabot"));
    expect(await screen.findByText("Collection Two")).toBeInTheDocument();
  });

  it("should change selected collection for embedded metabot", async () => {
    await setup(FIXED_METABOT_IDS.EMBEDDED);

    expect(
      fetchMock.callHistory.calls(
        `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.EMBEDDED}/prompt-suggestions?limit=10&offset=0`,
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
      new RegExp(`/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.EMBEDDED}`),
    );
    expect(puts[0].body).toEqual({ collection_id: 31 });

    expect(
      fetchMock.callHistory.calls(
        `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.EMBEDDED}/prompt-suggestions?limit=10&offset=0`,
      ).length,
    ).toEqual(2); // +1 refetch for DELETE, +1 for PUT
  });

  it("should show special copy for embedded metabot", async () => {
    await setup(FIXED_METABOT_IDS.EMBEDDED);

    expect(
      await screen.findByText(/embedding the metabot component/i),
    ).toBeInTheDocument();
  });

  it("should show an error message when a request fails", async () => {
    await setup(404, defaultMetabots, defaultSeedCollections, true);

    expect(
      await screen.findByText("Error fetching Metabots"),
    ).toBeInTheDocument();
  });

  describe("MetabotVerifiedContentConfigurationPane", () => {
    const mockContentVerificationEnabled = (enabled: boolean) => {
      mockHasPremiumFeature.mockImplementation((feature) => {
        if (feature === "content_verification") {
          return enabled;
        }
        return true; // Mock other features as enabled by default
      });
    };

    it("should not show verification switch without content_verification feature", async () => {
      mockContentVerificationEnabled(false);

      await setup();

      // First ensure the page has loaded
      await screen.findByText(/Configure Metabot/);

      expect(screen.queryByText("Verified content")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Only use Verified content"),
      ).not.toBeInTheDocument();
    });

    it("should show verification switch with content_verification feature", async () => {
      mockContentVerificationEnabled(true);

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
      mockContentVerificationEnabled(true);

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
});
