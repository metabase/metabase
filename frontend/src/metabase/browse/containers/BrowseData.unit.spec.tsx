import fetchMock from "fetch-mock";
import { createMockDatabase } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import type { CollectionItemWithLastEditInfo } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import { BrowseDataPage } from "./BrowseData";

const renderBrowseDataPage = () => {
  return renderWithProviders(<BrowseDataPage />);
};

const databases = [...Array(1000)].map((_, index) =>
  createMockDatabase({ id: index, name: `Database ${index}` }),
);

let collectionId;
const models = [...Array(1000)].map(
  (_, index) =>
    ({
      id: index,
      name: `Model ${index}`,
      collection: {
        // Put 3 models in each collection
        id: (collectionId = Math.ceil(index / 3)),
        name: `Collection ${collectionId}`,
      },
      "last-edit-info": {
        timestamp: "2021-01-01T00:00:00.000Z",
        first_name: "John",
        last_name: "Doe",
      },
    } as CollectionItemWithLastEditInfo),
);

const setDatabaseCount = (count: number) => {
  setupDatabasesEndpoints(
    databases.slice(0, count),
    {
      hasSavedQuestions: false,
    },
    {},
  );
};

const setModelCount = (count: number) => {
  fetchMock.get(
    {
      url: "path:/api/search",
      query: {
        models: ["dataset"],
        filter_items_in_personal_collection: "exclude",
      },
    },
    () => ({
      body: { data: models.slice(0, count) },
    }),
  );
};

const setup = ({
  models,
  databases,
}: {
  models: number;
  databases: number;
}) => {
  setModelCount(models);
  setDatabaseCount(databases);
  renderBrowseDataPage();
};

describe("BrowseDataPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("displays models in the models tab", async () => {
    const modelCount = 100;
    setup({ models: modelCount, databases: 0 });
    // Exercise the tabs a little
    (await screen.findByRole("tab", { name: "Databases" })).click();
    (await screen.findByRole("tab", { name: "Models" })).click();
    // Find the models
    for (let i = 0; i < modelCount; i++) {
      const model = await screen.findByText(`Model ${i}`);
      expect(model).toBeInTheDocument();
    }
  });
  it("displays databases in the databases tab", async () => {
    const databaseCount = 100;
    setup({ models: 0, databases: databaseCount });
    (await screen.findByRole("tab", { name: "Databases" })).click();
    for (let i = 0; i < databaseCount; i++) {
      const database = await screen.findByText(`Database ${i}`);
      expect(database).toBeInTheDocument();
    }
  });
  it("displays a 'no models' message in the Models tab when no models exist", async () => {
    setup({ models: 0, databases: 10 });
    (await screen.findByRole("tab", { name: "Databases" })).click();
    (await screen.findByRole("tab", { name: "Models" })).click();
    expect(await screen.findByText("No models here yet")).toBeInTheDocument();
  });
  it("displays a 'no databases' message in the Databases tab when no databases exist", async () => {
    setup({ models: 10, databases: 0 });
    (await screen.findByRole("tab", { name: "Databases" })).click();
    expect(
      await screen.findByText("No databases here yet"),
    ).toBeInTheDocument();
  });
  it("displays models, organized by parent collection", async () => {
    setup({ models: 5, databases: 0 });
    // Three <a> representing models have aria-labelledby="collection-1 model-$id",
    // and "collection-1" is the id of an element containing text 'Collection 1'
    const modelsInCollection1 = await screen.findAllByLabelText("Collection 1");
    expect(modelsInCollection1).toHaveLength(3);
  });
});
