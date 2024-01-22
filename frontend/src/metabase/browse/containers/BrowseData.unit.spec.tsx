import fetchMock from "fetch-mock";
import { createMockDatabase } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import type { SearchResult } from "metabase-types/api";
import { BrowseDataPage } from "./BrowseData";

const renderBrowseDataPage = () => {
  return renderWithProviders(<BrowseDataPage />);
};

const databases = [...Array(100)].map((_, index) =>
  createMockDatabase({ id: index, name: `Database ${index}` }),
);

const models = [...Array(100)].map((_, index) => {
  const collectionId = Math.floor(index / 3);
  return {
    id: index,
    name: `Model ${index}`,
    collection: {
      // Put 3 models in each collection
      id: collectionId,
      name: `Collection ${collectionId}`,
    },
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
  renderBrowseDataPage();
};

describe("BrowseDataPage", () => {
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
    const modelsInCollection1 = await screen.findAllByLabelText("Collection 1");
    expect(modelsInCollection1).toHaveLength(3);
    const modelsInCollection2 = await screen.findAllByLabelText("Collection 2");
    expect(modelsInCollection2).toHaveLength(3);
  });
  it("displays last edited information about models", async () => {
    setup({ models: 3, databases: 0 });
    await screen.findByText("Model 0");
    expect(await screen.findAllByText(/years ago/)).toHaveLength(3);
  });
});
