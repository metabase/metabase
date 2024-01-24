import fetchMock from "fetch-mock";
import { createMockDatabase } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import type { Collection, SearchResult } from "metabase-types/api";
import { createMockSetupState } from "metabase-types/store/mocks";
import { BrowseApp } from "../components/BrowseApp";
import { groupModels } from "./BrowseModels";

const renderBrowseApp = () => {
  return renderWithProviders(<BrowseApp />, {
    storeInitialState: {
      setup: createMockSetupState({ locale: { name: "English", code: "en" } }),
    },
  });
};

const databases = [...Array(100)].map((_, index) =>
  createMockDatabase({ id: index, name: `Database ${index}` }),
);

const collectionNames = [
  "Collection A",
  "Collection B",
  "Collection C",
  "Collection D",
  "Collection Z",
  "Collection Ä",
  "Collection Ö",
];

const models = [...Array(21)].map((_, index) => {
  // Put 3 models in each collection
  const collection: Partial<Collection> & { id: number } = {
    id: Math.floor(index / 3),
  };
  collection.name = collectionNames[collection.id];
  return {
    id: index,
    name: `Model ${index}`,
    collection,
    last_editor_common_name: "Nicole Oresme",
    last_edited_at: `${2000 - index}-01-01T00:00:00.000Z`,
  } as SearchResult;
});

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
  renderBrowseApp();
};

// TODO: Move to BrowseApp.unit...
describe("BrowseApp", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("has the models tab selected by default", async () => {
    setup({ models: 1, databases: 0 });
    expect(
      await screen.findByRole("tab", { name: "Models", selected: true }),
    ).toBeInTheDocument();
  });
  it("displays models in the models tab", async () => {
    const modelCount = 10;
    setup({ models: modelCount, databases: 0 });
    // Exercise the tabs a little
    (await screen.findByRole("tab", { name: "Databases" })).click();
    (await screen.findByRole("tab", { name: "Models" })).click();
    for (let i = 0; i < modelCount; i++) {
      expect(await screen.findByText(`Model ${i}`)).toBeInTheDocument();
    }
  });
  it("displays databases in the databases tab", async () => {
    const databaseCount = 10;
    setup({ models: 0, databases: databaseCount });
    (await screen.findByRole("tab", { name: "Databases" })).click();
    for (let i = 0; i < databaseCount; i++) {
      expect(await screen.findByText(`Database ${i}`)).toBeInTheDocument();
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
    setup({ models: 10, databases: 0 });
    // Three <a> tags representing models have aria-labelledby="collection-1 model-$id",
    // and "collection-1" is the id of an element containing text 'Collection 1',
    // so the following line finds those <a> tags.
    const modelsInCollection1 = await screen.findAllByLabelText("Collection A");
    expect(modelsInCollection1).toHaveLength(3);
    const modelsInCollection2 = await screen.findAllByLabelText("Collection B");
    expect(modelsInCollection2).toHaveLength(3);
  });
  it("displays last edited information about models", async () => {
    setup({ models: 3, databases: 0 });
    await screen.findByText("Model 0");
    expect(await screen.findAllByText(/[0-9]+yr/)).toHaveLength(3);
  });
  it("has a function that groups models by collection", () => {
    const { groupedModels } = groupModels(models, "en");
    // Check that models are grouped
    expect(groupedModels[0]).toHaveLength(3);
    expect(groupedModels[1]).toHaveLength(3);
    expect(groupedModels[2]).toHaveLength(3);
    expect(groupedModels[3]).toHaveLength(3);
    expect(groupedModels[4]).toHaveLength(3);
    expect(groupedModels[5]).toHaveLength(3);
    expect(groupedModels[6]).toHaveLength(3);
  });
  it("has a function that sorts collection names correctly in English", () => {
    const { collections } = groupModels(models, "en");
    // Check that the collections are alphabetized according to the locale
    expect(collections).toEqual([
      { id: 0, name: "Collection A" },
      { id: 5, name: "Collection Ä" },
      { id: 1, name: "Collection B" },
      { id: 2, name: "Collection C" },
      { id: 3, name: "Collection D" },
      { id: 6, name: "Collection Ö" },
      { id: 4, name: "Collection Z" },
    ]);
  });
  it("has a function that groups models by collection correctly in Swedish", () => {
    const { collections } = groupModels(models, "sv-SV");
    expect(collections).toEqual([
      { id: 0, name: "Collection A" },
      { id: 1, name: "Collection B" },
      { id: 2, name: "Collection C" },
      { id: 3, name: "Collection D" },
      { id: 4, name: "Collection Z" },
      { id: 5, name: "Collection Ä" },
      { id: 6, name: "Collection Ö" },
    ]);
  });
});
