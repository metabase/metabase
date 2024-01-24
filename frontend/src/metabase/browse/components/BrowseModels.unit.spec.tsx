import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, SearchResult } from "metabase-types/api";
import { createMockSetupState } from "metabase-types/store/mocks";
import { groupModels, BrowseModels } from "../containers/BrowseModels";

const renderBrowseModels = (modelCount: number) => {
  const models = mockModels.slice(0, modelCount);
  return renderWithProviders(
    <BrowseModels
      modelsResult={{ data: models, isLoading: false, error: false }}
    />,
    {
      storeInitialState: {
        setup: createMockSetupState({
          locale: { name: "English", code: "en" },
        }),
      },
    },
  );
};

const collectionNames = [
  "Collection A",
  "Collection B",
  "Collection C",
  "Collection D",
  "Collection Z",
  "Collection Ä",
  "Collection Ö",
];

const mockModels = [...Array(21)].map((_, index) => {
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

describe("BrowseModels", () => {
  it("displays models", async () => {
    renderBrowseModels(10);
    for (let i = 0; i < 10; i++) {
      expect(await screen.findByText(`Model ${i}`)).toBeInTheDocument();
    }
  });
  it("displays a 'no models' message in the Models tab when no models exist", async () => {
    renderBrowseModels(0);
    expect(await screen.findByText("No models here yet")).toBeInTheDocument();
  });
  it("displays models, organized by parent collection", async () => {
    renderBrowseModels(10);
    // Three <a> tags representing models have aria-labelledby="collection-1 model-$id",
    // and "collection-1" is the id of an element containing text 'Collection 1',
    // so the following line finds those <a> tags.
    const modelsInCollection1 = await screen.findAllByLabelText("Collection A");
    expect(modelsInCollection1).toHaveLength(3);
    const modelsInCollection2 = await screen.findAllByLabelText("Collection B");
    expect(modelsInCollection2).toHaveLength(3);
  });
  it("displays last edited information about models", async () => {
    renderBrowseModels(3);
    await screen.findByText("Model 0");
    expect(await screen.findAllByText(/[0-9]+yr/)).toHaveLength(3);
  });
  it("has a function that groups models by collection", () => {
    const { groupedModels } = groupModels(mockModels, "en");
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
    const { collections } = groupModels(mockModels, "en");
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
    const { collections } = groupModels(mockModels, "sv-SV");
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
