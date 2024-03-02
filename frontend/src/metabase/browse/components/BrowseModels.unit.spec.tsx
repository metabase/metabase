import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { defaultRootCollection } from "metabase/admin/permissions/pages/CollectionPermissionsPage/tests/setup";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockModelResult,
} from "metabase-types/api/mocks";
import { createMockSetupState } from "metabase-types/store/mocks";

import { BROWSE_MODELS_LOCALSTORAGE_KEY } from "../constants";

import { BrowseModels } from "./BrowseModels";

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

const collectionAlpha = createMockCollection({ id: 99, name: "Alpha" });
const collectionBeta = createMockCollection({ id: 1, name: "Beta" });
const collectionCharlie = createMockCollection({ id: 2, name: "Charlie" });
const collectionDelta = createMockCollection({ id: 3, name: "Delta" });
const collectionZulu = createMockCollection({ id: 4, name: "Zulu" });
const collectionAngstrom = createMockCollection({ id: 5, name: "Ångström" });
const collectionOzgur = createMockCollection({ id: 6, name: "Özgür" });
const collectionGrande = createMockCollection({ id: 7, name: "Grande" });

const mockModels: SearchResult[] = [
  {
    id: 0,
    name: "Model 0",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:59.000Z",
  },
  {
    id: 1,
    name: "Model 1",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:30.000Z",
  },
  {
    id: 2,
    name: "Model 2",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:00.000Z",
  },
  {
    id: 3,
    name: "Model 3",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:50:00.000Z",
  },
  {
    id: 4,
    name: "Model 4",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:00:00.000Z",
  },
  {
    id: 5,
    name: "Model 5",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T22:00:00.000Z",
  },
  {
    id: 6,
    name: "Model 6",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T12:00:00.000Z",
  },
  {
    id: 7,
    name: "Model 7",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-10T12:00:00.000Z",
  },
  {
    id: 8,
    name: "Model 8",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-11-15T12:00:00.000Z",
  },
  {
    id: 9,
    name: "Model 9",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-02-15T12:00:00.000Z",
  },
  {
    id: 10,
    name: "Model 10",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2023-12-15T12:00:00.000Z",
  },
  {
    id: 11,
    name: "Model 11",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2020-01-01T00:00:00.000Z",
  },
  {
    id: 12,
    name: "Model 12",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 13,
    name: "Model 13",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 14,
    name: "Model 14",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 15,
    name: "Model 15",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 16,
    name: "Model 16",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 17,
    name: "Model 17",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 18,
    name: "Model 18",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 19,
    name: "Model 19",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 20,
    name: "Model 20",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 21,
    name: "Model 21",
    collection: defaultRootCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 22,
    name: "Model 22",
    collection: defaultRootCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  ...new Array(100).fill(null).map((_, i) => {
    return createMockModelResult({
      id: i + 300,
      name: `Model ${i + 300}`,
      collection: collectionGrande,
      last_editor_common_name: "Bobby",
      last_edited_at: "2000-01-01T00:00:00.000Z",
    });
  }),
].map(model => createMockModelResult(model));

describe("BrowseModels", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("displays a 'no models' message in the Models tab when no models exist", async () => {
    renderBrowseModels(0);
    expect(await screen.findByText("No models here yet")).toBeInTheDocument();
  });

  it("displays collection groups", async () => {
    renderBrowseModels(10);
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(await screen.findByText("Charlie")).toBeInTheDocument();
    expect(await screen.findByText("Delta")).toBeInTheDocument();
  });

  it("displays models in collections by default", () => {
    const modelCount = 22;
    renderBrowseModels(modelCount);
    expect(screen.queryByText("No models here yet")).not.toBeInTheDocument();
    assertThatModelsExist(0, modelCount - 1);
  });

  it("can collapse collections to hide models within them", async () => {
    renderBrowseModels(10);
    userEvent.click(await screen.findByLabelText("collapse Alpha"));
    expect(screen.queryByText("Model 0")).not.toBeInTheDocument();
    expect(screen.queryByText("Model 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Model 2")).not.toBeInTheDocument();

    userEvent.click(await screen.findByLabelText("collapse Beta"));
    expect(screen.queryByText("Model 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Model 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Model 5")).not.toBeInTheDocument();
  });

  it("can expand a collection to see models within it", async () => {
    renderBrowseModels(10);
    userEvent.click(await screen.findByLabelText("collapse Alpha"));
    expect(screen.queryByText("Model 0")).not.toBeInTheDocument();
    userEvent.click(await screen.findByLabelText("expand Alpha"));
    expect(await screen.findByText("Model 0")).toBeInTheDocument();
  });

  it("displays the Our Analytics collection if it has a model", async () => {
    renderBrowseModels(25);
    await screen.findByText("Alpha");
    await screen.findByText("Our analytics");
    expect(await screen.findByText("Model 20")).toBeInTheDocument();
    expect(await screen.findByText("Model 21")).toBeInTheDocument();
    expect(await screen.findByText("Model 22")).toBeInTheDocument();
  });

  it("shows the first six models in a collection by default", async () => {
    renderBrowseModels(9999);
    expect(await screen.findByText("100 models")).toBeInTheDocument();
    expect(await screen.findByText("Show all")).toBeInTheDocument();
    assertThatModelsExist(300, 305);
  });

  it("can show more than 6 models by clicking 'Show all'", async () => {
    renderBrowseModels(9999);
    await screen.findByText("6 of 100");
    expect(screen.queryByText("Model 350")).not.toBeInTheDocument();
    userEvent.click(await screen.findByText("Show all"));
    assertThatModelsExist(300, 399);
  });

  it("can show less than all models by clicking 'Show less'", async () => {
    renderBrowseModels(9999);
    expect(screen.queryByText("Model 399")).not.toBeInTheDocument();
    userEvent.click(await screen.findByText("Show all"));
    await screen.findByText("Model 301");
    expect(screen.getByText("Model 399")).toBeInTheDocument();
    userEvent.click(await screen.findByText("Show less"));
    await screen.findByText("Model 301");
    expect(screen.queryByText("Model 399")).not.toBeInTheDocument();
  });

  it("persists show-all state when expanding and collapsing collections", async () => {
    renderBrowseModels(9999);
    userEvent.click(screen.getByText("Show all"));
    expect(await screen.findByText("Model 301")).toBeInTheDocument();
    expect(screen.getByText("Model 399")).toBeInTheDocument();

    userEvent.click(screen.getByLabelText("collapse Grande"));
    expect(screen.queryByText("Model 301")).not.toBeInTheDocument();
    expect(screen.queryByText("Model 399")).not.toBeInTheDocument();

    userEvent.click(screen.getByLabelText("expand Grande"));
    expect(await screen.findByText("Model 301")).toBeInTheDocument();
    expect(screen.getByText("Model 399")).toBeInTheDocument();
  });

  describe("local storage", () => {
    it("persists the expanded state of collections in local storage", async () => {
      renderBrowseModels(10);
      userEvent.click(await screen.findByLabelText("collapse Alpha"));
      expect(screen.queryByText("Model 0")).not.toBeInTheDocument();
      expect(localStorage.getItem(BROWSE_MODELS_LOCALSTORAGE_KEY)).toEqual(
        JSON.stringify({ 99: { expanded: false, showAll: false } }),
      );
    });

    it("loads the collapsed state of collections from local storage", async () => {
      localStorage.setItem(
        BROWSE_MODELS_LOCALSTORAGE_KEY,
        JSON.stringify({ 99: { expanded: false, showAll: false } }),
      );
      renderBrowseModels(10);
      expect(screen.queryByText("Model 0")).not.toBeInTheDocument();
    });

    it("persists the 'show all' state of collections in local storage", async () => {
      renderBrowseModels(9999);
      userEvent.click(await screen.findByText("Show all"));
      await screen.findByText("Model 399");
      expect(localStorage.getItem(BROWSE_MODELS_LOCALSTORAGE_KEY)).toEqual(
        JSON.stringify({ 7: { expanded: true, showAll: true } }),
      );
    });

    it("loads the 'show all' state of collections from local storage", async () => {
      localStorage.setItem(
        BROWSE_MODELS_LOCALSTORAGE_KEY,
        JSON.stringify({ 7: { expanded: true, showAll: true } }),
      );
      renderBrowseModels(9999);
      expect(await screen.findByText("Show less")).toBeInTheDocument();
      assertThatModelsExist(300, 399);
    });

    it("can deal with invalid local storage data", async () => {
      localStorage.setItem(BROWSE_MODELS_LOCALSTORAGE_KEY, "{invalid json[[[}");
      renderBrowseModels(10);
      expect(await screen.findByText("Model 0")).toBeInTheDocument();
      userEvent.click(await screen.findByLabelText("collapse Alpha"));
      expect(screen.queryByText("Model 0")).not.toBeInTheDocument();
      // ignores invalid data and persists the new state
      expect(localStorage.getItem(BROWSE_MODELS_LOCALSTORAGE_KEY)).toEqual(
        JSON.stringify({ 99: { expanded: false, showAll: false } }),
      );
    });
  });
});

function assertThatModelsExist(startId: number, endId: number) {
  for (let i = startId; i <= endId; i++) {
    expect(screen.getByText(`Model ${i}`)).toBeInTheDocument();
  }
}
