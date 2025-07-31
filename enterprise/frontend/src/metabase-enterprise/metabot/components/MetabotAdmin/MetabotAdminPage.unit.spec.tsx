import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  setupMetabotAddEntitiesEndpoint,
  setupMetabotDeleteEntitiesEndpoint,
  setupMetabotEntitiesEndpoint,
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  MetabotApiEntity,
  MetabotEntity,
  MetabotId,
  RecentItem,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { MetabotAdminPage } from "./MetabotAdminPage";
import * as hooks from "./utils";

const mockPathParam = (id: MetabotId) => {
  jest.spyOn(hooks, "useMetabotIdPath").mockReturnValue(id);
};

const metabots = [
  {
    id: 1,
    name: "Metabot One",
  },
  {
    id: 2,
    name: "Metabot Two",
  },
  {
    id: 3,
    name: "Embedded Metabot Three",
  },
];

const entities = {
  1: [
    {
      model_id: 11,
      name: "Collection One",
      model: "collection",
      collection_id: 12,
      collection_name: "Collection One Prime",
    },
  ],
  2: [
    {
      model_id: 21,
      name: "Collection Two",
      model: "collection",
      collection_id: 22,
      collection_name: "Collection Two Prime",
    },
  ] as MetabotApiEntity[],
  3: [],
  recents: [
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
  ],
};

const setup = async (
  initialPathParam: MetabotId = 1,
  seedData = entities,
  error = false,
) => {
  mockPathParam(initialPathParam);
  setupMetabotsEndpoint(metabots, error ? 500 : undefined);
  const collections = [...seedData[1], ...seedData[2], ...seedData.recents];
  setupCollectionByIdEndpoint({
    collections: collections.map((c: any) => ({ id: c.model_id, ...c })),
  });

  metabots.forEach((metabot) => {
    setupMetabotEntitiesEndpoint(
      metabot.id,
      seedData[metabot.id as 1 | 2] as MetabotApiEntity[],
    );
    setupMetabotAddEntitiesEndpoint(metabot.id);
  });
  setupMetabotDeleteEntitiesEndpoint();

  setupRecentViewsAndSelectionsEndpoints(seedData.recents as RecentItem[]);

  metabots.forEach((mb) =>
    setupMetabotPromptSuggestionsEndpoint(mb.id, [], {
      offset: 0,
      limit: 10,
      total: 0,
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
    expect(await screen.findByText("Metabot One")).toBeInTheDocument();
    expect(screen.getByText("Metabot Two")).toBeInTheDocument();
  });

  it("should render a selected collection", async () => {
    await setup();
    expect(await screen.findByText("Collection One")).toBeInTheDocument();
  });

  it("should be able to switch between metabots", async () => {
    await setup(1);
    await screen.findByText("Collection One");

    mockPathParam(2);
    await userEvent.click(await screen.findByText("Metabot Two"));
    expect(await screen.findByText("Collection Two")).toBeInTheDocument();
  });

  it("should change selected collection", async () => {
    await setup(1);

    expect(
      fetchMock.callHistory.calls(`path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`)
        .length,
    ).toEqual(1); // should have loaded prompt suggestions

    expect(await screen.findByText("Collection One")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Pick a different collection"));

    await screen.findByText("Select a collection");
    await userEvent.click(screen.getByText("Collection Three"));
    await userEvent.click(screen.getByText("Select"));

    await waitFor(async () => {
      const deletes = await findRequests("DELETE");
      expect(deletes.length).toBe(1);
    });

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts.length).toBe(1);
    });

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/\/api\/ee\/metabot-v3\/metabot\/1\/entities/);
    expect(body.items).toHaveLength(1); // 1 new

    expect(
      body.items.find((item: MetabotEntity) => item.id === 31),
    ).toBeTruthy();

    expect(
      fetchMock.callHistory.calls(`path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`)
        .length,
    ).toEqual(3); // +1 refetch for DELETE, +1 for PUT
  });

  it("should not allow selecting the root collection", async () => {
    // setup entity picker endpoints
    const rootCollection = createMockCollection({ id: "root" });
    setupCollectionsEndpoints({ collections: [rootCollection] });
    setupCollectionItemsEndpoint({
      collection: rootCollection,
      collectionItems: [],
      models: [],
    });
    setupCollectionItemsEndpoint({
      collection: createMockCollection({ id: 1 }),
      collectionItems: [],
      models: [],
    });

    // default to no entities for default metabot - this will default the
    // entity picker's initial value to be the root collection
    await setup(1, { ...entities, 1: [] });

    await userEvent.click(screen.getByText("Pick a collection"));

    const entityPicker = await screen.findByTestId("entity-picker-modal");
    const entityPickerTabs =
      await within(entityPicker).findByTestId("tabs-view");
    await userEvent.click(
      await within(entityPickerTabs).findByText(/Collections/),
    );

    // should not be able to select the default Our analytics option
    expect(
      await screen.findByRole("button", { name: /Select/ }),
    ).toBeDisabled();
  });

  it("should delete the selected collection", async () => {
    await setup(1);

    expect(await screen.findByText("Collection One")).toBeInTheDocument();
    expect(await screen.findByText("Prompt suggestions")).toBeInTheDocument();
    const [deleteButton] = await screen.findAllByLabelText("trash icon");
    setupMetabotEntitiesEndpoint(1, []);
    await userEvent.click(deleteButton);

    const [{ url: deleteUrl }, ...rest] = await findRequests("DELETE");
    expect(deleteUrl).toContain("metabot/1/entities/collection/11");
    expect(rest).toHaveLength(0); // only 1 delete
    await waitFor(() => {
      expect(screen.queryByText("Prompt suggestions")).not.toBeInTheDocument();
    });
  });

  it("should show an empty state when no entities", async () => {
    await setup(1, {
      1: [],
      2: [],
      3: [],
      recents: [],
    });
    expect(await screen.findByText("Pick a collection")).toBeInTheDocument();

    expect(screen.queryByLabelText("trash icon")).not.toBeInTheDocument();
  });

  it("should show special copy for embedded metabot", async () => {
    await setup(3);

    expect(
      await screen.findByText(/embedding the metabot component/i),
    ).toBeInTheDocument();
  });

  it("should show an error message when a request fails", async () => {
    await setup(3, entities, true);

    expect(
      await screen.findByText("Error fetching Metabots"),
    ).toBeInTheDocument();
  });
});
