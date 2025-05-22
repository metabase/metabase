import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  setupMetabotAddEntitiesEndpoint,
  setupMetabotDeleteEntitiesEndpoint,
  setupMetabotEntitiesEndpoint,
  setupMetabotsEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  MetabotApiEntity,
  MetabotEntity,
  MetabotId,
  RecentItem,
} from "metabase-types/api";

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

const setup = async (initialPathParam: MetabotId = 1, seedData = entities) => {
  mockPathParam(initialPathParam);
  setupMetabotsEndpoint(metabots);
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

  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotAdminPage} />,
    {
      withRouter: true,
      initialRoute: `/admin/metabot/${initialPathParam}`,
    },
  );

  await screen.findByText("Configure Metabot");
};

describe("MetabotAdminPage", () => {
  it("should render the page", async () => {
    await setup();
    expect(screen.getByText("Configure Metabot")).toBeInTheDocument();
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
    expect(url).toMatch(/\/api\/ee\/metabot-v3\/metabots\/1\/entities/);
    expect(body.items).toHaveLength(1); // 1 new

    expect(
      body.items.find((item: MetabotEntity) => item.id === 31),
    ).toBeTruthy();
  });

  it("should delete the selected collection", async () => {
    await setup(1);
    expect(await screen.findByText("Collection One")).toBeInTheDocument();
    const [deleteButton] = await screen.findAllByLabelText("trash icon");
    await userEvent.click(deleteButton);

    const [{ url: deleteUrl }, ...rest] = await findRequests("DELETE");
    expect(deleteUrl).toContain("metabots/1/entities/collection/11");
    expect(rest).toHaveLength(0); // only 1 delete
  });

  it("should show an empty state when no entities", async () => {
    await setup(1, {
      1: [],
      2: [],
      recents: [],
    });
    expect(await screen.findByText("Pick a collection")).toBeInTheDocument();

    expect(screen.queryByLabelText("trash icon")).not.toBeInTheDocument();
  });
});
