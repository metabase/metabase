import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  findRequests,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  setupMetabotAddEntitiesEndpoint,
  setupMetabotDeleteEntitiesEndpoint,
  setupMetabotEntitiesEndpoint,
  setupMetabotsEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen } from "__support__/ui";
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
      name: "Model One",
      model: "dataset",
      collection_id: 1,
      collection_name: "Collection One",
    },
    {
      model_id: 12,
      name: "Metric One",
      model: "metric",
      collection_id: 2,
      collection_name: "Collection Two",
    },
  ],
  2: [
    {
      model_id: 21,
      name: "Model Two",
      model: "dataset",
      collection_id: 1,
      collection_name: "Collection One",
    },
    {
      model_id: 22,
      name: "Metric Two",
      model: "metric",
      collection_id: 2,
      collection_name: "Collection Two",
    },
  ] as MetabotApiEntity[],
  recents: [
    {
      id: 31,
      name: "Model Three",
      model: "dataset",
      parent_collection: {
        id: 3,
        name: "Collection Three",
      },
    },
    {
      id: 32,
      name: "Metric Three",
      model: "metric",
      parent_collection: {
        id: 3,
        name: "Collection Three",
      },
    },
  ],
};

const setup = async (initialPathParam: MetabotId = 1, seedData = entities) => {
  mockPathParam(initialPathParam);
  setupMetabotsEndpoint(metabots);
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

  it("should render table of entities", async () => {
    await setup();
    expect(await screen.findByText("Model One")).toBeInTheDocument();
    expect(screen.getByText("Metric One")).toBeInTheDocument();

    expect(screen.getByText("Collection Two")).toBeInTheDocument();
    expect(screen.getByText("Collection One")).toBeInTheDocument();

    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("should be able to switch between metabots", async () => {
    await setup(1);
    await screen.findByText("Model One");
    expect(screen.getByText("Metric One")).toBeInTheDocument();

    mockPathParam(2);
    await userEvent.click(await screen.findByText("Metabot Two"));
    expect(await screen.findByText("Model Two")).toBeInTheDocument();
    expect(screen.getByText("Metric Two")).toBeInTheDocument();
  });

  it("should add entities to the metabot context", async () => {
    await setup(1);
    expect(await screen.findByText("Model One")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Add items"));

    await screen.findByText("Select items");
    await userEvent.click(screen.getByText("Model Three"));

    const puts = await findRequests("PUT");
    expect(puts.length).toBe(1);
    const [{ url, body }] = puts;

    expect(url).toMatch(/\/api\/ee\/metabot-v3\/metabots\/1\/entities/);
    expect(body.items).toHaveLength(3); // 2 existing + 1 new

    expect(
      body.items.find((item: MetabotEntity) => item.id === 31),
    ).toBeTruthy();
  });

  it("should delete entities from the metabot context", async () => {
    await setup(1);
    expect(await screen.findByText("Model One")).toBeInTheDocument();
    expect(await screen.findByText("Metric One")).toBeInTheDocument();

    setupMetabotEntitiesEndpoint(
      1,
      entities[1].slice(1, 2) as MetabotApiEntity[],
    );
    const [deleteButton] = await screen.findAllByLabelText("close icon");
    await userEvent.click(deleteButton);

    const [{ url: deleteUrl }, ...rest] = await findRequests("DELETE");
    expect(deleteUrl).toContain("metabots/1/entities/dataset/11");
    expect(rest).toHaveLength(0); // only 1 delete
    expect(await screen.findByText("1 item")).toBeInTheDocument();
    expect(screen.queryByText("Model One")).not.toBeInTheDocument(); // should be gone
  });

  it("should show an empty state when no entities", async () => {
    await setup(1, {
      1: [],
      2: [],
      recents: [],
    });
    expect(await screen.findByText("0 items")).toBeInTheDocument();
    expect(
      await screen.findByText("There's nothing here, yet"),
    ).toBeInTheDocument();
  });
});
