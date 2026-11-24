import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  COMMON_DATABASE_FEATURES,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { CreateTransformMenu } from "./CreateTransformMenu";

describe("CreateTransformMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the SQL query item", async () => {
    setupDatabasesEndpoints([createMockDatabase()]);
    renderWithProviders(<CreateTransformMenu />, { withRouter: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a transform" }),
    );

    expect(await screen.findByText("SQL query")).toBeInTheDocument();
  });

  it("does not allow copying a question or a model based on the Sample Database", async () => {
    const WRITABLE_DB_ID = 2;
    const transformFeatures = [
      ...COMMON_DATABASE_FEATURES,
      "schemas" as const,
      "transforms/table" as const,
    ];
    // Everything but `is_sample` would make the Sample Database usable for transforms.
    const sampleDatabase = createSampleDatabase({
      features: transformFeatures,
      transforms_permissions: "write",
    });
    const writableDatabase = createMockDatabase({
      id: WRITABLE_DB_ID,
      name: "Writable Postgres12",
      engine: "postgres",
      features: transformFeatures,
      transforms_permissions: "write",
    });
    const root = createMockCollection(ROOT_COLLECTION);

    mockGetBoundingClientRect();
    setupDatabasesEndpoints([sampleDatabase, writableDatabase]);
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    setupSearchEndpoints([]);
    setupCollectionByIdEndpoint({ collections: [root] });
    setupCollectionItemsEndpoint({
      collection: root,
      collectionItems: [
        createMockCollectionItem({
          id: 1,
          name: "Test question",
          model: "card",
          collection_id: null,
          database_id: SAMPLE_DB_ID,
        }),
        createMockCollectionItem({
          id: 2,
          name: "Test model",
          model: "dataset",
          collection_id: null,
          database_id: SAMPLE_DB_ID,
        }),
        createMockCollectionItem({
          id: 3,
          name: "Writable question",
          model: "card",
          collection_id: null,
          database_id: WRITABLE_DB_ID,
        }),
      ],
    });
    const state = createMockState({
      settings: mockSettings({
        "transforms-enabled": true,
        "token-features": createMockTokenFeatures({
          "transforms-basic": true,
        }),
      }),
    });
    setupEnterprisePlugins();
    renderWithProviders(<CreateTransformMenu />, {
      withRouter: true,
      storeInitialState: state,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a transform" }),
    );
    await userEvent.click(await screen.findByText("Copy of a saved question"));

    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Our analytics"));

    expect(
      await within(modal).findByRole("link", { name: /Test question/ }),
    ).toHaveAttribute("data-disabled", "true");
    expect(
      within(modal).getByRole("link", { name: /Test model/ }),
    ).toHaveAttribute("data-disabled", "true");
    expect(
      within(modal).getByRole("link", { name: /Writable question/ }),
    ).not.toHaveAttribute("data-disabled");
  });
});
