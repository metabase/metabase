import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { reinitialize } from "metabase/plugins";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  getQuestionVirtualTableId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Collection,
  Database,
  DatabaseId,
  SearchModel,
  Table,
  TableId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataSourceSelector } from "../DataSelector";

const DATABASES = [createSampleDatabase()];

const OTHER_DB_ID = 2;
const OTHER_DB_TABLE_ID = 9001;
const REVENUE_METRIC_ID = 9002;

const LIBRARY_DATA_SUBFOLDER = createMockCollection({
  id: 6468,
  name: "Finance",
  type: "library-data",
  here: ["table"],
});
const LIBRARY_DATA_COLLECTION = createMockCollection({
  id: 6465,
  name: "Data",
  type: "library-data",
  here: ["table"],
  below: ["table"],
  children: [
    LIBRARY_DATA_SUBFOLDER,
    createMockCollection({ id: 6469, name: "Drafts", type: "library-data" }),
  ],
});
const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: 6466,
  name: "Metrics",
  type: "library-metrics",
  here: ["metric"],
});
const LIBRARY_COLLECTION_ID = 6464;
const LIBRARY_COLLECTION = createMockCollection({
  id: LIBRARY_COLLECTION_ID,
  name: "Library",
  type: "library",
  here: ["collection"],
  below: ["table", "metric", "dashboard"],
  children: [
    LIBRARY_DATA_COLLECTION,
    LIBRARY_METRICS_COLLECTION,
    createMockCollection({
      id: 6467,
      name: "Dashboards",
      type: "library-dashboards",
      here: ["dashboard"],
    }),
  ],
});
const LIBRARY_COLLECTION_WITH_ONLY_DASHBOARDS = createMockCollection({
  ...LIBRARY_COLLECTION,
  below: ["dashboard"],
  children: [
    createMockCollection({ id: 6465, name: "Data", type: "library-data" }),
    createMockCollection({
      id: 6466,
      name: "Metrics",
      type: "library-metrics",
    }),
  ],
});
const LIBRARY_COLLECTION_WITH_ONLY_METRICS = createMockCollection({
  ...LIBRARY_COLLECTION,
  below: ["metric"],
  children: [
    createMockCollection({ id: 6465, name: "Data", type: "library-data" }),
    LIBRARY_METRICS_COLLECTION,
  ],
});
const LIBRARY_COLLECTION_WITH_ONLY_TABLES = createMockCollection({
  ...LIBRARY_COLLECTION,
  below: ["table"],
  children: [
    LIBRARY_DATA_COLLECTION,
    createMockCollection({
      id: 6466,
      name: "Metrics",
      type: "library-metrics",
    }),
  ],
});

type AvailableModel = Extract<
  SearchModel,
  "table" | "dataset" | "card" | "metric"
>;

interface SetupOpts {
  databases?: Database[];
  isJoinStep?: boolean;
  querySourceType?: "model" | "question";
  availableModels: AvailableModel[];
  selectedTable?: {
    id: TableId;
    databaseId: number;
  };
  selectedDatabaseId?: DatabaseId;
  entityTypes: EmbeddingEntityType[];
  libraryCollection?: Collection;
  hasNestedQueriesEnabled?: boolean;
}

function setup({
  databases = DATABASES,
  isJoinStep = false,
  querySourceType,
  availableModels,
  selectedTable,
  selectedDatabaseId = selectedTable?.databaseId,
  entityTypes,
  libraryCollection,
  hasNestedQueriesEnabled = true,
}: SetupOpts) {
  fetchMock.get({
    url: "path:/api/search",
    query: {
      calculate_available_models: true,
      limit: 0,
      models: ["dataset", "metric"],
    },
    response: {
      data: [],
      limit: 0,
      models: ["dataset", "metric"],
      offset: 0,
      table_db_id: null,
      engine: "search.engine/in-place",
      total: 1,
      available_models: availableModels,
    },
  });

  setupDatabasesEndpoints(
    databases,
    { hasSavedQuestions: availableModels.includes("card") },
    { saved: true },
  );

  setupCollectionsEndpoints({
    collections: libraryCollection ? [libraryCollection] : [],
  });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [],
  });

  // `mockSettings` has to run first, as the Library plugin (semantic layer) reads the token
  // features when it initializes.
  const settings = mockSettings({
    "enable-nested-queries": hasNestedQueriesEnabled,
    ...(libraryCollection && {
      "token-features": createMockTokenFeatures({ library: true }),
    }),
  });

  if (libraryCollection) {
    setupEnterpriseOnlyPlugin("library");
    setupLibraryEndpoints({
      hasLibrary: true,
      library: { below: libraryCollection.below },
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_DATA_COLLECTION,
      collectionItems: [
        createMockCollectionItem({
          id: ORDERS_ID,
          name: "Published Orders",
          model: "table",
          database_id: SAMPLE_DB_ID,
        }),
        createMockCollectionItem({
          id: OTHER_DB_TABLE_ID,
          name: "Published Elsewhere",
          model: "table",
          database_id: OTHER_DB_ID,
        }),
      ],
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_DATA_SUBFOLDER,
      collectionItems: [
        createMockCollectionItem({
          id: getNextId(),
          name: "Finance Orders",
          model: "table",
          database_id: SAMPLE_DB_ID,
        }),
      ],
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_METRICS_COLLECTION,
      collectionItems: [
        createMockCollectionItem({
          id: REVENUE_METRIC_ID,
          name: "Revenue",
          model: "metric",
          database_id: SAMPLE_DB_ID,
        }),
      ],
    });
  }

  return renderWithProviders(
    <DataSourceSelector
      isInitiallyOpen
      querySourceType={querySourceType}
      canChangeDatabase={!isJoinStep}
      selectedDatabaseId={selectedDatabaseId ?? null}
      selectedTableId={selectedTable ? selectedTable.id : undefined}
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
      canSelectQuestion={entityTypes.includes("question")}
      canSelectMetric={entityTypes.includes("metric")}
      canSelectSemanticLayer={entityTypes.includes("semantic-layer")}
      triggerElement={<div>Click me to open or close data picker</div>}
      setSourceTableFn={jest.fn()}
    />,
    {
      storeInitialState: createMockState({ settings }),
    },
  );
}

describe("DataSourceSelector", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should close the picker when clicking outside", async () => {
    setup({
      availableModels: ["table"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    });

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();

    await userEvent.click(
      screen.getByText("Click me to open or close data picker"),
    );

    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
  });

  describe("only tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: ["table"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    };

    it("should show search input when there are 10 and more tables", async () => {
      const sampleDatabase = createSampleDatabase();
      const DB_ID = getNextId(sampleDatabase.id);
      setup({
        ...setupOpts,
        databases: [
          sampleDatabase,
          createMockDatabase({
            id: DB_ID,
            name: "Many tables Database",
            tables: [...createNNumberOfTables(10, DB_ID)],
          }),
        ],
      });
      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(screen.getByText("Many tables Database")).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Many tables Database"));
      expect(await screen.findByText("Table 1")).toBeInTheDocument();
      expect(screen.getByText("Table 2")).toBeInTheDocument();
      expect(screen.getByText("Table 3")).toBeInTheDocument();
      expect(screen.getByText("Table 4")).toBeInTheDocument();
      expect(screen.getByText("Table 5")).toBeInTheDocument();
      expect(screen.getByText("Table 6")).toBeInTheDocument();
      expect(screen.getByText("Table 7")).toBeInTheDocument();
      expect(screen.getByText("Table 8")).toBeInTheDocument();
      expect(screen.getByText("Table 9")).toBeInTheDocument();
      expect(screen.getByText("Table 10")).toBeInTheDocument();

      const searchBox = screen.getByPlaceholderText("Find...");
      expect(searchBox).toBeInTheDocument();

      // Assert that the search query is used.
      await userEvent.type(searchBox, "Table 1");
      expect(await screen.findByText("Table 1")).toBeInTheDocument();
      expect(screen.queryByText("Table 2")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 3")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 4")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 5")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 6")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 7")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 8")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 9")).not.toBeInTheDocument();
      expect(screen.getByText("Table 10")).toBeInTheDocument();
    });

    it("should not show search input when there less than 10 tables", async () => {
      setup(setupOpts);
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("Sample Database")).toBeInTheDocument();

      expect(screen.queryByPlaceholderText("Find...")).not.toBeInTheDocument();
    });

    it("should return to the schema list when going back from the tables with two schemas", async () => {
      const twoSchemaDatabase = createMockDatabase({
        id: OTHER_DB_ID,
        name: "Two Schema Database",
        tables: [
          createMockTable({
            id: OTHER_DB_TABLE_ID,
            db_id: OTHER_DB_ID,
            schema: "accounting",
            display_name: "Ledger",
          }),
          createMockTable({
            id: getNextId(OTHER_DB_TABLE_ID),
            db_id: OTHER_DB_ID,
            schema: "finance",
            display_name: "Budget",
          }),
        ],
      });
      setup({
        ...setupOpts,
        databases: [createSampleDatabase(), twoSchemaDatabase],
      });

      await userEvent.click(await screen.findByText("Two Schema Database"));
      await userEvent.click(await screen.findByText("Accounting"));
      expect(await screen.findByText("Ledger")).toBeInTheDocument();
      await userEvent.click(screen.getByLabelText("chevronleft icon"));

      expect(await screen.findByText("Finance")).toBeInTheDocument();
      expect(screen.getByText("Accounting")).toBeInTheDocument();
    });

    it("should show an empty state, not the tables, when only models are allowed and there are none", async () => {
      setup({ ...setupOpts, entityTypes: ["model"] });

      expect(
        await screen.findByText(
          "To pick some data, you'll need to add some first",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });
  });

  describe("both models and tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: ["table", "dataset"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    };

    it("should go back to the databases when reopened on a model with nested queries disabled", async () => {
      const model = createMockCard({
        id: 140,
        name: "Orders model",
        type: "model",
      });
      setupCardEndpoints(model);
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: getQuestionVirtualTableId(model.id),
          db_id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        }),
      );

      setup({
        ...setupOpts,
        hasNestedQueriesEnabled: false,
        selectedTable: {
          id: getQuestionVirtualTableId(model.id),
          databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });

      expect(await screen.findByText("Models")).toBeInTheDocument();
      expect(screen.getByText("Our analytics")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("saved-entity-back-navigation"));

      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
    });

    it('should open the databases, not the models, when reopened on a model and `entityTypes` = ["table"]', async () => {
      const model = createMockCard({
        id: 140,
        name: "Orders model",
        type: "model",
      });
      setupCardEndpoints(model);
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: getQuestionVirtualTableId(model.id),
          db_id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        }),
      );
      const otherDatabase = createMockDatabase({
        id: OTHER_DB_ID,
        name: "Other Database",
        tables: [
          createMockTable({ id: OTHER_DB_TABLE_ID, db_id: OTHER_DB_ID }),
        ],
      });

      setup({
        ...setupOpts,
        entityTypes: ["table"],
        databases: [createSampleDatabase(), otherDatabase],
        selectedTable: {
          id: getQuestionVirtualTableId(model.id),
          databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });

      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(screen.getByText("Other Database")).toBeInTheDocument();
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
    });

    it('should open the models, not the saved questions, when reopened on a question and `entityTypes` = ["model"]', async () => {
      const question = createMockCard({ id: 140, name: "Orders question" });
      setupCardEndpoints(question);
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: getQuestionVirtualTableId(question.id),
          db_id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        }),
      );

      setup({
        ...setupOpts,
        entityTypes: ["model"],
        selectedTable: {
          id: getQuestionVirtualTableId(question.id),
          databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Models")).toBeInTheDocument();
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    });

    it("should open the models, never the saved questions, when reopened on a model that is still loading", async () => {
      const model = createMockCard({
        id: 140,
        name: "Orders model",
        type: "model",
      });
      fetchMock.get(`path:/api/card/${model.id}`, model, { delay: 500 });
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: getQuestionVirtualTableId(model.id),
          db_id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        }),
      );

      setup({
        ...setupOpts,
        selectedTable: {
          id: getQuestionVirtualTableId(model.id),
          databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });

      await waitFor(() =>
        expect(fetchMock.callHistory.called(`path:/api/card/${model.id}`)).toBe(
          true,
        ),
      );
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();

      expect(await screen.findByText("Models")).toBeInTheDocument();
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    });

    it("should open the saved questions when reopened on a card whose request fails", async () => {
      const cardId = 140;
      fetchMock.get(
        `path:/api/card/${cardId}`,
        { status: 500 },
        { delay: 500 },
      );
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: getQuestionVirtualTableId(cardId),
          db_id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        }),
      );

      setup({
        ...setupOpts,
        selectedTable: {
          id: getQuestionVirtualTableId(cardId),
          databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        },
      });

      expect(await screen.findByText("Saved Questions")).toBeInTheDocument();
    });

    it("should only show data from the selected database when joining data", async () => {
      const sampleDatabase = createSampleDatabase();
      const DB_ID = getNextId(sampleDatabase.id);
      const manyTablesDatabase = createMockDatabase({
        id: DB_ID,
        name: "Many tables Database",
        tables: [...createNNumberOfTables(10, DB_ID)],
      });

      setup({
        ...setupOpts,
        isJoinStep: true,
        databases: [sampleDatabase, manyTablesDatabase],
        selectedTable: {
          // Unjustified type cast. FIXME
          id: (manyTablesDatabase.tables as Table[])[0].id as number,
          databaseId: manyTablesDatabase.id,
        },
      });

      expect(
        await screen.findByText("Many tables Database"),
      ).toBeInTheDocument();
      expect(screen.getByText("Table 1")).toBeInTheDocument();
      await userEvent.click(screen.getByText("Many tables Database"));
      // We're at the database step
      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Many tables Database")).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
    });

    it("should open the models when joining data on a model", async () => {
      setup({
        ...setupOpts,
        isJoinStep: true,
        querySourceType: "model",
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Models")).toBeInTheDocument();
    });

    it('should open the tables, not the models, when joining data on a model and `entityTypes` = ["table"]', async () => {
      setup({
        ...setupOpts,
        entityTypes: ["table"],
        isJoinStep: true,
        querySourceType: "model",
        selectedDatabaseId: SAMPLE_DB_ID,
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
    });

    it("should skip the bucket step and show the SavedEntityPicker right away if there is only models in the bucket step", async () => {
      setup({
        ...setupOpts,
        entityTypes: ["model"],
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Models")).toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    });
  });

  describe("both questions and tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: ["table", "card"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    };

    it("should skip the bucket step and show the SavedEntityPicker right away if there is only questions in the bucket step", async () => {
      setup({
        ...setupOpts,
        entityTypes: ["question"],
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    });

    it("should open the saved questions when joining data on a question", async () => {
      setup({
        ...setupOpts,
        isJoinStep: true,
        querySourceType: "question",
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });

    it('should open the tables, not the saved questions, when joining data on a question and `entityTypes` = ["table"]', async () => {
      setup({
        ...setupOpts,
        entityTypes: ["table"],
        isJoinStep: true,
        querySourceType: "question",
        selectedDatabaseId: SAMPLE_DB_ID,
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    });

    it("should return to the bucket step when closing the saved entity picker via its back button", async () => {
      setup(setupOpts);

      await userEvent.click(await screen.findByText("Saved Questions"));
      expect(await screen.findByText("Our analytics")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("saved-entity-back-navigation"));

      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
      expect(
        screen.queryByTestId("saved-entity-back-navigation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("both metrics and tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: ["table", "metric"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    };

    it("should skip the bucket step and show the SavedEntityPicker right away if there is only metrics in the bucket step", async () => {
      setup({
        ...setupOpts,
        entityTypes: ["metric"],
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    });

    it("should not offer metrics when joining", async () => {
      setup({
        ...setupOpts,
        isJoinStep: true,
        selectedTable: { id: ORDERS_ID, databaseId: SAMPLE_DB_ID },
      });

      // Go back from the table step to the database step, which offers no
      // way back to a bucket step when metrics are the only other option
      await userEvent.click(await screen.findByLabelText("chevronleft icon"));

      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("chevronleft icon"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    });

    it("should return to the bucket step when closing the saved entity picker via its back button", async () => {
      setup(setupOpts);

      await userEvent.click(await screen.findByText("Metrics"));
      expect(await screen.findByText("Our analytics")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("saved-entity-back-navigation"));

      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(
        screen.queryByTestId("saved-entity-back-navigation"),
      ).not.toBeInTheDocument();
    });

    it("should not offer metrics when nested queries are disabled", async () => {
      setup({ ...setupOpts, hasNestedQueriesEnabled: false });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    });
  });

  describe("the semantic layer is available", () => {
    const setupOpts: SetupOpts = {
      availableModels: ["table"],
      entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
    };

    it("should skip the bucket step and show the Data and Metrics step right away if there is only the semantic layer in the bucket step", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        entityTypes: ["semantic-layer"],
      });

      expect(await screen.findByText("Data")).toBeInTheDocument();
      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(screen.getAllByTestId("data-bucket-list-item")).toHaveLength(2);
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    });

    it('should not show a back link when `entityTypes` = ["semantic-layer"]', async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        entityTypes: ["semantic-layer"],
      });

      expect(await screen.findByText("Data")).toBeInTheDocument();
      expect(
        screen.queryByTestId("semantic-layer-picker-back-navigation"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Semantic layer")).not.toBeInTheDocument();
    });

    it('should show the folder title without a back link when `entityTypes` = ["semantic-layer"] and the semantic layer has one folder', async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_TABLES,
        entityTypes: ["semantic-layer"],
      });

      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(screen.getByTestId("saved-entity-title")).toHaveTextContent(
        "Data",
      );
      expect(
        screen.queryByTestId("saved-entity-back-navigation"),
      ).not.toBeInTheDocument();
    });

    it("should list the tables and the metrics published in the semantic layer", async () => {
      setup({ ...setupOpts, libraryCollection: LIBRARY_COLLECTION });

      await userEvent.click(await screen.findByText("Semantic layer"));
      await userEvent.click(await screen.findByText("Data"));
      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(screen.getByText("Published Elsewhere")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("saved-entity-back-navigation"));
      await userEvent.click(await screen.findByText("Metrics"));
      expect(await screen.findByText("Revenue")).toBeInTheDocument();
    });

    it("should open the metrics right away when the semantic layer only has metrics", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_METRICS,
      });

      await userEvent.click(await screen.findByText("Semantic layer"));

      expect(await screen.findByText("Revenue")).toBeInTheDocument();
      expect(
        screen.queryByTestId("data-bucket-list-item"),
      ).not.toBeInTheDocument();
    });

    it("should open the tables right away when the semantic layer only has tables", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_TABLES,
      });

      await userEvent.click(await screen.findByText("Semantic layer"));

      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(
        screen.queryByTestId("data-bucket-list-item"),
      ).not.toBeInTheDocument();
    });

    it("should show the semantic layer subfolders that hold tables", async () => {
      setup({ ...setupOpts, libraryCollection: LIBRARY_COLLECTION });

      await userEvent.click(await screen.findByText("Semantic layer"));
      await userEvent.click(await screen.findByText("Data"));

      const tree = await screen.findByTestId("saved-entity-collection-tree");
      expect(within(tree).queryByText("Drafts")).not.toBeInTheDocument();
      await userEvent.click(within(tree).getByText("Finance"));
      expect(await screen.findByText("Finance Orders")).toBeInTheDocument();
    });

    it("should not offer a semantic layer with nothing to pick from", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_DASHBOARDS,
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryByText("Semantic layer")).not.toBeInTheDocument();
    });

    it("should show an empty state, not the tables, when only the semantic layer is allowed and it has nothing to pick from", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_DASHBOARDS,
        entityTypes: ["semantic-layer"],
      });

      expect(
        await screen.findByText(
          "To pick some data, you'll need to add some first",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });

    it("should not offer a semantic layer with only metrics when joining", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION_WITH_ONLY_METRICS,
        isJoinStep: true,
        selectedTable: { id: ORDERS_ID, databaseId: SAMPLE_DB_ID },
      });

      // Go back from the table step to the database step, which offers no
      // way back to a bucket step when the semantic layer has nothing joinable
      await userEvent.click(await screen.findByLabelText("chevronleft icon"));

      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("chevronleft icon"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Semantic layer")).not.toBeInTheDocument();
    });

    it("should only list the semantic layer's tables from the current database, without its metrics, when joining", async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        isJoinStep: true,
        selectedTable: { id: ORDERS_ID, databaseId: SAMPLE_DB_ID },
      });

      // Go back from the table step to the bucket step
      await userEvent.click(await screen.findByLabelText("chevronleft icon"));
      await userEvent.click(await screen.findByLabelText("chevronleft icon"));
      await userEvent.click(await screen.findByText("Semantic layer"));

      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(screen.queryByText("Published Elsewhere")).not.toBeInTheDocument();
      expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    });

    it('should open a join on the semantic layer\'s tables, with no way back to the raw tables, when `entityTypes` = ["semantic-layer"]', async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        entityTypes: ["semantic-layer"],
        isJoinStep: true,
        selectedDatabaseId: SAMPLE_DB_ID,
      });

      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(screen.queryByText("Published Elsewhere")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
      expect(screen.getByTestId("saved-entity-title")).toHaveTextContent(
        "Data",
      );
    });

    it('should open on the semantic layer, not the raw tables, when reopened with a published table and `entityTypes` = ["semantic-layer"]', async () => {
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        entityTypes: ["semantic-layer"],
        selectedTable: { id: ORDERS_ID, databaseId: SAMPLE_DB_ID },
      });

      expect(await screen.findByText("Semantic layer")).toBeInTheDocument();
      expect(await screen.findByText("Data")).toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });

    it("should return to the bucket step when closing the semantic layer via its back button", async () => {
      // A saved-questions database is what an extra back step would land on
      setup({
        libraryCollection: LIBRARY_COLLECTION,
        availableModels: ["table", "card"],
        entityTypes: ["model", "table", "question", "metric", "semantic-layer"],
      });

      await userEvent.click(await screen.findByText("Semantic layer"));
      expect(
        await screen.findByTestId("semantic-layer-picker-back-navigation"),
      ).toHaveTextContent("Semantic layer");

      await userEvent.click(
        screen.getByTestId("semantic-layer-picker-back-navigation"),
      );

      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Semantic layer")).toBeInTheDocument();
      expect(
        screen.queryByTestId("semantic-layer-picker-back-navigation"),
      ).not.toBeInTheDocument();
    });

    it("should not offer the semantic layer's metrics when nested queries are disabled", async () => {
      // A metric is queried as a saved card, which needs nested queries, so
      // Data is the only folder left
      setup({
        ...setupOpts,
        libraryCollection: LIBRARY_COLLECTION,
        hasNestedQueriesEnabled: false,
      });

      await userEvent.click(await screen.findByText("Semantic layer"));

      expect(await screen.findByText("Published Orders")).toBeInTheDocument();
      expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    });
  });

  // metabase#74428: after the "Remove database entity" PR the picker hydrated as
  // soon as the (fast) models search resolved, so it showed the models bucket
  // before the database list had loaded and streamed the databases in
  // afterwards. The picker must wait for both before rendering its first step.
  describe("when the database list resolves after the models search (metabase#74428)", () => {
    function setupWithDeferredDatabaseList() {
      let resolveSearch!: () => void;
      const searchResponse = new Promise<void>((resolve) => {
        resolveSearch = resolve;
      });
      fetchMock.get({
        url: "path:/api/search",
        query: {
          calculate_available_models: true,
          limit: 0,
          models: ["dataset", "metric"],
        },
        response: () =>
          searchResponse.then(() => ({
            data: [],
            limit: 0,
            models: ["dataset", "metric"],
            offset: 0,
            table_db_id: null,
            total: 1,
            available_models: ["table", "dataset"],
          })),
        name: "deferred-search",
      });

      let resolveDatabaseList!: () => void;
      const databaseListResponse = new Promise<void>((resolve) => {
        resolveDatabaseList = resolve;
      });
      fetchMock.get({
        url: "path:/api/database",
        query: { saved: true },
        response: () =>
          databaseListResponse.then(() => ({
            data: DATABASES,
            total: DATABASES.length,
          })),
        name: "deferred-database-list",
      });

      renderWithProviders(
        <DataSourceSelector
          isInitiallyOpen
          querySourceType={undefined}
          canChangeDatabase
          selectedDatabaseId={null}
          canSelectModel
          canSelectTable
          canSelectQuestion
          canSelectMetric
          canSelectSemanticLayer
          triggerElement={<div>Click me to open or close data picker</div>}
          setSourceTableFn={jest.fn()}
        />,
        {
          storeInitialState: createMockState({
            // `databases` is empty while the list request is in flight, so we
            // need data-access permissions to render the picker (rather than the
            // "add some data first" empty state) during that window.
            currentUser: createMockUser({
              permissions: createMockUserPermissions({
                can_create_queries: true,
              }),
            }),
            settings: createMockSettingsState({
              "enable-nested-queries": true,
            }),
          }),
        },
      );

      return { resolveSearch, resolveDatabaseList };
    }

    it("does not render the data bucket step until the databases have loaded", async () => {
      const { resolveSearch, resolveDatabaseList } =
        setupWithDeferredDatabaseList();

      // Both requests are in flight, so the picker shows its loading state.
      expect(
        await screen.findByTestId("loading-indicator"),
      ).toBeInTheDocument();

      // The models search resolves first; the database list is still pending.
      resolveSearch();
      await waitFor(() => {
        expect(
          screen.queryByTestId("loading-indicator"),
        ).not.toBeInTheDocument();
      });

      // Regression: the bucket step must NOT appear yet. Before the fix, "Models"
      // showed here, ahead of the still-loading databases.
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();

      // Once the databases load, the bucket step appears with everything at once.
      resolveDatabaseList();
      expect(await screen.findByText("Models")).toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
    });
  });
});

function createNNumberOfTables(numberOfTables: number, dbId: number): Table[] {
  // To avoid having the same ID as the sample database tables
  const STARTING_TABLE_ID = 100;
  return Array.from({ length: numberOfTables }, (_, index) =>
    createMockTable({
      id: getNextId(index === 0 ? STARTING_TABLE_ID : undefined),
      db_id: dbId,
      display_name: `Table ${index + 1}`,
    }),
  );
}
