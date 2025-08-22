import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoints,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  FIXED_METABOT_ENTITY_IDS,
  FIXED_METABOT_IDS,
} from "metabase-enterprise/metabot/constants";
import type { MetabotId, RecentItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockMetabotInfo,
} from "metabase-types/api/mocks";

import { MetabotAdminPage } from "./MetabotAdminPage";
import * as hooks from "./utils";

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
    collection_name: "Collection Two Prime",
    parent_collection: {
      id: 3,
      name: "Collection Two Prime",
    },
  },
  {
    id: 31,
    name: "Collection Three",
    model: "collection",
    parent_collection: {
      id: 3,
      name: "Collection Three Prime",
    },
  },
  {
    id: 32,
    name: "Collection Four",
    model: "collection",
    parent_collection: {
      id: 3,
      name: "Collection Four Prime",
    },
  },
];
const setup = async (
  initialPathParam: MetabotId = 1,
  metabots = defaultMetabots,
  seedCollections = defaultSeedCollections,
  error = false,
) => {
  mockPathParam(initialPathParam);
  setupMetabotsEndpoints(metabots, error ? 500 : undefined);
  setupCollectionByIdEndpoint({
    collections: seedCollections.map((c: any) => ({ id: c.model_id, ...c })),
  });

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

  it("should not be able to select a collection for default metabot", async () => {
    await setup();
    expect(await screen.findByText("Configure Metabot")).toBeInTheDocument();
    expect(
      screen.queryByText("Collection Metabot can use"),
    ).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByText("Collection Three"));
    await userEvent.click(screen.getByText("Select"));

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
});
