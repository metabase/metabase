import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { defaultRootCollection } from "metabase/admin/permissions/pages/CollectionPermissionsPage/tests/setup";
import {
  createMockCollection,
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { createMockSetupState } from "metabase-types/store/mocks";

import { createMockModelResult, createMockRecentModel } from "../test-utils";

import { BrowseModels } from "./BrowseModels";

const setup = (modelCount: number, recentModelCount = 5) => {
  const mockModelResults = mockModels.map(model =>
    createMockModelResult(model),
  );
  const mockRecentModels = mockModels
    .slice(0, recentModelCount)
    .map(model => createMockRecentModel(model));
  const models = mockModelResults.slice(0, modelCount);
  setupSearchEndpoints(models.map(model => createMockSearchResult(model)));
  setupSettingsEndpoints([]);
  setupRecentViewsEndpoints(mockRecentModels);
  return renderWithProviders(<BrowseModels />, {
    storeInitialState: {
      setup: createMockSetupState({
        locale: { name: "English", code: "en" },
      }),
    },
  });
};

const collectionAlpha = createMockCollection({ id: 99, name: "Alpha" });
const collectionBeta = createMockCollection({
  id: 1,
  name: "Beta",
  effective_ancestors: [collectionAlpha],
});
const collectionCharlie = createMockCollection({
  id: 2,
  name: "Charlie",
  effective_ancestors: [collectionAlpha, collectionBeta],
});
const collectionDelta = createMockCollection({
  id: 3,
  name: "Delta",
  effective_ancestors: [collectionAlpha, collectionBeta, collectionCharlie],
});
const collectionZulu = createMockCollection({
  id: 4,
  name: "Zulu",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
  ],
});
const collectionAngstrom = createMockCollection({
  id: 5,
  name: "Ångström",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
  ],
});
const collectionOzgur = createMockCollection({
  id: 6,
  name: "Özgür",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
  ],
});
const collectionGrande = createMockCollection({
  id: 7,
  name: "Grande",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
    collectionOzgur,
  ],
});

const mockModels = [
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
    return {
      id: i + 300,
      name: `Model ${i + 300}`,
      collection: collectionGrande,
      last_editor_common_name: "Bobby",
      last_edited_at: "2000-01-01T00:00:00.000Z",
    };
  }),
];

describe("BrowseModels", () => {
  it("displays a 'no models' message in the Models tab when no models exist", async () => {
    setup(0);
    expect(await screen.findByText("No models here yet")).toBeInTheDocument();
  });

  it("displays the Our Analytics collection if it has a model", async () => {
    setup(25);
    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });
    expect(modelsTable).toBeInTheDocument();
    expect(
      await screen.findAllByTestId("path-for-collection: Our analytics"),
    ).toHaveLength(2);
    expect(
      await within(modelsTable).findByText("Model 20"),
    ).toBeInTheDocument();
    expect(
      await within(modelsTable).findByText("Model 21"),
    ).toBeInTheDocument();
    expect(
      await within(modelsTable).findByText("Model 22"),
    ).toBeInTheDocument();
  });

  it("displays collection breadcrumbs", async () => {
    setup(25);
    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });
    expect(await within(modelsTable).findByText("Model 1")).toBeInTheDocument();
    expect(
      await within(modelsTable).findAllByTestId(
        "breadcrumbs-for-collection: Alpha",
      ),
    ).toHaveLength(3);
  });

  it("displays recently viewed models", async () => {
    setup(25);
    const recentModelsGrid = await screen.findByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 1"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 2"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 3"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 4"),
    ).toBeInTheDocument();
    expect(
      within(recentModelsGrid).queryByText("Model 5"),
    ).not.toBeInTheDocument();
  });

  it("displays no recently viewed models when there are fewer than 9 models - but instance analytics models do not count", async () => {
    setup(8);
    const recentModelsGrid = screen.queryByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).not.toBeInTheDocument();
  });
});
