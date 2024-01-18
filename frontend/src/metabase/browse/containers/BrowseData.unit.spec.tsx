import fetchMock from "fetch-mock";
import { createMockDatabase } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import type { SearchResult } from "metabase-types/api";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import { BrowseDataPage } from "./BrowseData";

jest.mock("./utils", () => ({
  ...jest.requireActual("./utils"),
  getPageWidth: jest.fn().mockReturnValue(800),
}));

// To make virtualization work, there needs to be a <main> element, provided
// via a useContext hook, which has a child with a certain width and height
const mockViewport = document.createElement("main");

const renderBrowseDataPage = () => {
  return renderWithProviders(
    <ContentViewportContext.Provider value={mockViewport}>
      <BrowseDataPage />,
    </ContentViewportContext.Provider>,
  );
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
  // we need to mock offsetHeight and offsetWidth to make react-virtualized work with react-dom
  // https://github.com/bvaughn/react-virtualized/issues/493#issuecomment-447014986
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  ) as number;
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  ) as number;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 500,
    });
  });

  afterAll(() => {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
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
