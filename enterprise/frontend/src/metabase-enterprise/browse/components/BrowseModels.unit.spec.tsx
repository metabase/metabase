import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupSearchEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { BrowseModels } from "metabase/browse/components/BrowseModels";
import { createMockModelResult } from "metabase/browse/test-utils";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSetupState } from "metabase-types/store/mocks";

const setup = (modelCount: number) => {
  const models = mockModels.slice(0, modelCount);
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

const mockModels: SearchResult[] = [
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

describe("BrowseModels", () => {
  it("does not display instance analytics collections", async () => {
    setup(4);
    expect(await screen.findByText("A normal model")).toBeInTheDocument();
    expect(screen.queryByText("instance analytics")).not.toBeInTheDocument();
  });
});
