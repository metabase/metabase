import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { CollectionItem } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockTokenFeatures,
  createMockTransform,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { CreateTransformMenu } from "../TransformListPage/CreateTransformMenu";

import {
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "./NewTransformPage";

// The global mock of NativeQueryEditor ignores which databases are disabled.
jest.unmock("metabase/querying/components/NativeQueryEditor");

const WRITABLE_DB_ID = 2;

const TRANSFORM_DB_FEATURES = [
  ...COMMON_DATABASE_FEATURES,
  "schemas",
  "transforms/table",
] as const;

const WRITABLE_DB = createMockDatabase({
  id: WRITABLE_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  features: [...TRANSFORM_DB_FEATURES],
  transforms_permissions: "write",
  tables: [
    createMockTable({
      id: 101,
      db_id: WRITABLE_DB_ID,
      schema: "Schema A",
      name: "Animals",
      display_name: "Animals",
    }),
  ],
});

// Everything but `is_sample` would make the Sample Database usable for transforms.
const SAMPLE_DB = createSampleDatabase({
  features: [...TRANSFORM_DB_FEATURES],
  transforms_permissions: "write",
});

const ROOT = createMockCollection(ROOT_COLLECTION);

const ANIMAL_QUESTION = createMockCollectionItem({
  id: 11,
  name: "Animal Question",
  model: "card",
  collection_id: null,
  database_id: WRITABLE_DB_ID,
});

// The collection items API leaves `database_id` out of metric rows.
const ANIMAL_METRIC = createMockCollectionItem({
  id: 12,
  name: "Animal Metric",
  model: "metric",
  collection_id: null,
});

const LIBRARY_ID = 6464;

const LIBRARY_DATA = createMockCollectionItem({
  id: 6465,
  name: "Data",
  model: "collection",
  type: "library-data",
  is_library_root: true,
  here: ["table"],
});

const LIBRARY_METRICS = createMockCollectionItem({
  id: 6466,
  name: "Metrics",
  model: "collection",
  type: "library-metrics",
  is_library_root: true,
  here: ["metric"],
});

function setupLibrary() {
  setupLibraryEndpoints({
    hasLibrary: true,
    library: { id: LIBRARY_ID, below: ["table", "metric"] },
  });
  setupCollectionItemsEndpoint({
    collection: { id: LIBRARY_ID },
    collectionItems: [LIBRARY_DATA, LIBRARY_METRICS],
  });
}

type SetupOpts = {
  rootCollectionItems?: CollectionItem[];
  hasLibrary?: boolean;
};

const SAVED_TRANSFORM_ID = 42;

function setup({
  rootCollectionItems = [ANIMAL_QUESTION, ANIMAL_METRIC],
  hasLibrary = false,
}: SetupOpts = {}) {
  const databases = [SAMPLE_DB, WRITABLE_DB];
  mockGetBoundingClientRect();
  // `empty_schema` holds no tables, so only the syncable schemas list it.
  fetchMock.get(`path:/api/database/${WRITABLE_DB_ID}/syncable_schemas`, [
    "Schema A",
    "empty_schema",
  ]);
  setupDatabasesEndpoints(databases);
  fetchMock.post(
    "path:/api/transform",
    createMockTransform({ id: SAVED_TRANSFORM_ID }),
  );
  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata({ databases }));
  setupNativeQuerySnippetEndpoints();
  fetchMock.get(
    { url: "path:/api/collection", query: { namespace: "snippets" } },
    [],
  );
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupSearchEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [ROOT] });
  setupCollectionItemsEndpoint({
    collection: ROOT,
    collectionItems: rootCollectionItems,
  });
  if (hasLibrary) {
    setupLibrary();
  } else {
    setupLibraryEndpoints({ hasLibrary: false });
  }

  const state = createMockState({
    settings: mockSettings({
      "transforms-enabled": true,
      "token-features": createMockTokenFeatures({
        "transforms-basic": true,
        library: true,
      }),
    }),
  });
  setupEnterprisePlugins();

  renderWithProviders(
    <>
      <Route path="/data-studio/transforms" element={<CreateTransformMenu />} />
      <Route
        path="/data-studio/transforms/new/query"
        element={<NewQueryTransformPage />}
      />
      <Route
        path="/data-studio/transforms/new/native"
        element={<NewNativeTransformPage />}
      />
      <Route
        path="/data-studio/transforms/:transformId"
        element={<div>Saved transform page</div>}
      />
    </>,
    {
      withRouter: true,
      initialRoute: "/data-studio/transforms",
      storeInitialState: state,
    },
  );
}

async function startTransform(creationOption: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Create a transform" }),
  );
  await userEvent.click(await screen.findByText(creationOption));
}

describe("NewTransformPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("query builder transforms", () => {
    it("does not show the library in the mini picker (uxw-2403)", async () => {
      setup({ hasLibrary: true });
      await startTransform("Query builder");

      const miniPicker = await screen.findByTestId("mini-picker");
      expect(
        await within(miniPicker).findByText("Writable Postgres12"),
      ).toBeInTheDocument();
      expect(within(miniPicker).getByText("Our analytics")).toBeInTheDocument();
      expect(within(miniPicker).getByText("Browse all")).toBeInTheDocument();
      expect(within(miniPicker).queryByText("Data")).not.toBeInTheDocument();
    });

    it("does not offer the Sample Database or metrics as a source", async () => {
      setup();
      await startTransform("Query builder");

      const miniPicker = await screen.findByTestId("mini-picker");
      expect(
        await within(miniPicker).findByText("Writable Postgres12"),
      ).toBeInTheDocument();
      expect(
        within(miniPicker).queryByText("Sample Database"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(miniPicker).getByText("Our analytics"));
      expect(
        await within(miniPicker).findByText("Animal Question"),
      ).toBeInTheDocument();
      expect(within(miniPicker).queryByText(/metric/i)).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("mini-picker-header"));
      await userEvent.click(within(miniPicker).getByText("Browse all"));
      const modal = await screen.findByTestId("entity-picker-modal");

      await userEvent.click(await within(modal).findByText("Databases"));
      const sampleDatabase = await within(modal).findByRole("link", {
        name: /Sample Database/,
      });
      expect(sampleDatabase).toHaveAttribute("data-disabled", "true");
      expect(
        within(modal).getByRole("link", { name: /Writable Postgres12/ }),
      ).not.toHaveAttribute("data-disabled");

      await userEvent.hover(sampleDatabase);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Transforms can't be enabled on the Sample Database.",
      );

      await userEvent.click(within(modal).getByText("Our analytics"));
      expect(
        await within(modal).findByRole("link", { name: /Animal Metric/ }),
      ).toHaveAttribute("data-disabled", "true");
      expect(
        within(modal).getByRole("link", { name: /Animal Question/ }),
      ).not.toHaveAttribute("data-disabled");
    });

    it("does not crash the mini picker on a collection with lots of hidden items (GDGT-1776)", async () => {
      const ITEMS_COUNT = 1000;
      // Tables of the Sample Database, which transforms can't use
      const hiddenTables = Array.from(
        { length: ITEMS_COUNT },
        (_value, index) =>
          createMockCollectionItem({
            ...createMockSearchResult({ id: index + 1, model: "table" }),
            collection_id: null,
          }),
      );
      setup({ rootCollectionItems: hiddenTables });
      await startTransform("Query builder");

      const miniPicker = await screen.findByTestId("mini-picker");
      await userEvent.click(
        await within(miniPicker).findByText("Our analytics"),
      );
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called("path:/api/collection/root/items"),
        ).toBe(true),
      );

      await waitFor(() =>
        expect(
          screen.queryByTestId("mini-picker-list-loader"),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("mini-picker-header")).toHaveTextContent(
        "Our analytics",
      );
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Something’s gone wrong"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });
  });

  describe("SQL transforms", () => {
    it("can save into a schema that holds no tables (metabase#68378)", async () => {
      setup();
      await startTransform("SQL query");
      await userEvent.click(
        await screen.findByRole("option", { name: "Writable Postgres12" }),
      );
      await userEvent.type(
        within(
          await screen.findByTestId("native-query-editor-container"),
        ).getByRole("textbox"),
        "SELECT 42",
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      const modal = await screen.findByRole("dialog", {
        name: "Save your transform",
      });
      await userEvent.type(
        within(modal).getByLabelText("Name"),
        "SQL transform",
      );
      await userEvent.click(within(modal).getByLabelText("Schema"));
      await userEvent.click(
        await screen.findByRole("option", { name: "empty_schema" }),
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );

      expect(
        await screen.findByText("Saved transform page"),
      ).toBeInTheDocument();
      const request: unknown = await fetchMock.callHistory
        .lastCall("path:/api/transform", { method: "POST" })
        ?.request?.json();
      expect(request).toMatchObject({
        name: "SQL transform",
        target: { schema: "empty_schema", database: WRITABLE_DB_ID },
      });
    });

    it("does not offer the Sample Database as a source database", async () => {
      setup();
      await startTransform("SQL query");

      // The database popover opens on its own while no database is picked.
      await userEvent.click(
        await screen.findByRole("option", { name: "Writable Postgres12" }),
      );
      const databaseTrigger = within(
        await screen.findByTestId("gui-builder-data"),
      ).getByText("Writable Postgres12");
      await userEvent.click(databaseTrigger);

      const sampleDatabase = await screen.findByRole("option", {
        name: "Sample Database",
      });
      expect(sampleDatabase).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByRole("option", { name: "Writable Postgres12" }),
      ).toHaveAttribute("aria-disabled", "false");

      await userEvent.click(
        within(sampleDatabase).getByText("Sample Database"),
      );
      expect(
        screen.getByRole("option", { name: "Sample Database" }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId("gui-builder-data")).getByText(
          "Writable Postgres12",
        ),
      ).toBeInTheDocument();

      await userEvent.hover(
        screen.getByRole("option", { name: "Sample Database" }),
      );
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Transforms can't be enabled on the Sample Database.",
      );
    });
  });
});
