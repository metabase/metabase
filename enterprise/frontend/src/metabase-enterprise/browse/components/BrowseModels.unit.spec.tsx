import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { BrowseModels } from "metabase/browse/components/BrowseModels";
import {
  createMockModelResult,
  createMockRecentModel,
} from "metabase/browse/test-utils";
import type { RecentCollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSetupState } from "metabase-types/store/mocks";

const setup = (modelCount: number, recentModelCount = 5) => {
  const models = mockModels.slice(0, modelCount);

  // Add some instance analytics models to ensure they don't affect the page
  models.push(...mockInstanceAnalyticsModels);

  const mockRecentModels = mockModels
    .slice(0, recentModelCount)
    .map(model =>
      createMockRecentModel(model as unknown as RecentCollectionItem),
    );
  setupRecentViewsEndpoints(mockRecentModels);

  setupSearchEndpoints(models);
  setupSettingsEndpoints([]);
  setupEnterprisePlugins();
  return renderWithProviders(<BrowseModels />, {
    storeInitialState: {
      setup: createMockSetupState({
        locale: { name: "English", code: "en" },
      }),
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          official_collections: true,
          audit_app: true,
        }),
      }),
    },
  });
};

const instanceAnalyticsCollection = createMockCollection({
  id: 1,
  name: "Instance analytics collection",
  type: "instance-analytics",
});
const childOfInstanceAnalyticsCollection = createMockCollection({
  id: 2,
  name: "Child of instance analytics collection",
  type: null,
  effective_ancestors: [instanceAnalyticsCollection],
});
const notAnInstanceAnalyticsCollection = createMockCollection({
  id: 3,
  name: "Not an instance analytics collection",
  type: null,
});
const grandchildOfInstanceAnalyticsCollection = createMockCollection({
  id: 3,
  name: "Grandchild of instance analytics collection",
  type: null,
  effective_ancestors: [
    instanceAnalyticsCollection,
    notAnInstanceAnalyticsCollection,
  ],
});

const mockModels = [
  createMockModelResult({
    id: 0,
    name: "A normal model",
    collection: notAnInstanceAnalyticsCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:59.000Z",
  }),
  createMockModelResult({
    id: 1,
    name: "An instance analytics model",
    collection: instanceAnalyticsCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:30.000Z",
  }),
  createMockModelResult({
    id: 2,
    name: "Model in child of instance analytics collection",
    collection: childOfInstanceAnalyticsCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:00.000Z",
  }),
  createMockModelResult({
    id: 3,
    name: "Model in grandchild of instance analytics collection",
    collection: grandchildOfInstanceAnalyticsCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:50:00.000Z",
  }),
];

const mockInstanceAnalyticsModels = [
  createMockModelResult({
    id: 1000,
    name: "Instance analytics model 1",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1001,
    name: "Instance analytics model 2",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1002,
    name: "Instance analytics model 3",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1003,
    name: "Instance analytics model 4",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1004,
    name: "Instance analytics model 5",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1005,
    name: "Instance analytics model 6",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1006,
    name: "Instance analytics model 7",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1007,
    name: "Instance analytics model 8",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1008,
    name: "Instance analytics model 9",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
  createMockModelResult({
    id: 1009,
    name: "Instance analytics model 10",
    collection: createMockCollection({
      type: "instance-analytics",
    }),
  }),
];

describe("BrowseModels", () => {
  it("does not display instance analytics collections", async () => {
    setup(4);
    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });
    expect(
      await within(modelsTable).findByText("A normal model"),
    ).toBeInTheDocument();
    expect(screen.queryByText("instance analytics")).not.toBeInTheDocument();
  });
  it("displays recently viewed models when there are enough models", async () => {
    setup(9);
    const recentModelsGrid = await screen.findByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).toBeInTheDocument();
  });
  it("displays no recently viewed models when there are fewer than 9 models", async () => {
    setup(8);
    const recentModelsGrid = screen.queryByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).not.toBeInTheDocument();
  });
});
