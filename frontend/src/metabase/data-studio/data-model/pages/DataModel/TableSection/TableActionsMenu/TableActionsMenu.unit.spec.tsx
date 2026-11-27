import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupListSourceReplacementRunsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupTablesBulkEndpoints,
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
import { Route } from "metabase/router";
import type {
  DependencyNode,
  SourceReplacementCheckInfo,
  SourceReplacementErrorType,
  Table,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCheckReplaceSourceInfo,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockReplaceSourceColumnInfo,
  createMockSearchResult,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TableActionsMenu } from "./TableActionsMenu";

interface SetupOpts {
  table: Table;
  isAdmin?: boolean;
}

function setup({ table, isAdmin = false }: SetupOpts) {
  setupListSourceReplacementRunsEndpoint([]);
  setupTablesBulkEndpoints();

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    }),
  });

  // The find-and-replace action comes from the replacement EE plugin, which
  // gates `canReplaceSources` on whether the current user is an admin.
  setupEnterprisePlugins();

  renderWithProviders(
    <Route path="/" element={<TableActionsMenu table={table} />} />,
    { storeInitialState: state, withRouter: true, withUndos: true },
  );
}

describe("TableActionsMenu", () => {
  it("renders a menu with sync items for a regular table", async () => {
    setup({
      table: createMockTable({
        id: 42,
        db_id: 7,
        schema: "analytics",
        db: createMockDatabase({ id: 7 }),
      }),
    });

    // it's a menu, not a standalone link
    expect(
      screen.queryByRole("link", { name: /View schema/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(
      await screen.findByRole("menuitem", { name: /View schema/ }),
    ).toHaveAttribute(
      "href",
      "/data-studio/schema-viewer?database-id=7&schema=analytics&table-ids=42",
    );
    expect(
      screen.getByRole("menuitem", { name: /Re-sync schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Re-scan field values/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Discard cached field values/ }),
    ).toBeInTheDocument();
  });

  it("renders a standalone View schema button when there are no other actions", () => {
    // attached DWH => no sync items, and a non-admin can't replace sources
    setup({
      table: createMockTable({
        db: createMockDatabase({ is_attached_dwh: true }),
      }),
    });

    expect(
      screen.getByRole("link", { name: /View schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the menu when an admin can replace sources even without sync items", async () => {
    // attached DWH => no sync items, but an admin can use find-and-replace
    setup({
      table: createMockTable({
        db: createMockDatabase({ is_attached_dwh: true }),
      }),
      isAdmin: true,
    });

    // the selector keeps it a menu rather than collapsing to a button
    expect(
      screen.queryByRole("link", { name: /View schema/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(
      await screen.findByRole("menuitem", { name: /View schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Find and replace/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Re-sync schema/ }),
    ).not.toBeInTheDocument();
  });

  describe("error handling", () => {
    it.each([
      {
        item: "Re-sync schema",
        route: "tables-sync-schema",
        message: "Failed to start sync",
      },
      {
        item: "Re-scan field values",
        route: "tables-rescan-values",
        message: "Failed to start scan",
      },
      {
        item: "Discard cached field values",
        route: "tables-discard-values",
        message: "Failed to discard values",
      },
    ])(
      "shows an error toast when $item fails",
      async ({ item, route, message }) => {
        setup({ table: createMockTable({ db: createMockDatabase() }) });
        fetchMock.modifyRoute(route, { response: { status: 500 } });

        await userEvent.click(
          screen.getByRole("button", { name: "More actions" }),
        );
        await userEvent.click(
          await screen.findByRole("menuitem", { name: new RegExp(item) }),
        );

        await waitFor(() => {
          expect(
            within(screen.getByTestId("undo-list")).getByText(message),
          ).toBeInTheDocument();
        });
      },
    );
  });
});

describe("TableActionsMenu > find and replace", () => {
  const DATABASE = createMockDatabase({ id: 2, name: "Writable Postgres12" });
  const ROOT_COLLECTION = createMockCollection({
    id: "root",
    name: "Our analytics",
  });
  const PERSONAL_COLLECTION = createMockCollection({
    id: 1,
    name: "Bobby Tables's Personal Collection",
    is_personal: true,
    personal_owner_id: 1,
  });

  const SOURCE_TABLE = createReplacementTable(10, "Source Table");
  const COMPATIBLE_TARGET = createReplacementTable(11, "Compatible Target");
  const TARGET_EXTRA_COLUMNS = createReplacementTable(
    12,
    "Target Extra Columns",
  );
  const TARGET_TYPE_MISMATCH = createReplacementTable(
    13,
    "Target Type Mismatch",
  );
  const TARGET_MISSING_COLUMN = createReplacementTable(
    14,
    "Target Missing Column",
  );
  const QUESTION_ON_SOURCE = createMockCard({
    id: 20,
    name: "Question on source",
    database_id: DATABASE.id,
    collection: ROOT_COLLECTION,
  });

  const ID_COLUMN = createMockReplaceSourceColumnInfo({
    name: "id",
    display_name: "ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
  });
  const NAME_COLUMN = createMockReplaceSourceColumnInfo({
    name: "name",
    display_name: "Name",
  });
  const AMOUNT_COLUMN = createMockReplaceSourceColumnInfo({
    name: "amount",
    display_name: "Amount",
    base_type: "type/Decimal",
    effective_type: "type/Decimal",
  });
  const TEXT_AMOUNT_COLUMN = createMockReplaceSourceColumnInfo({
    name: "amount",
    display_name: "Amount",
  });
  const EXTRA_COLUMN = createMockReplaceSourceColumnInfo({
    name: "extra_field",
    display_name: "Extra Field",
  });

  // What POST /api/ee/replacement/check-replace-source returns for each
  // target when the source table is `SOURCE_TABLE`.
  const CHECK_INFO_BY_TARGET_KEY: Record<string, SourceReplacementCheckInfo> = {
    [`table:${COMPATIBLE_TARGET.id}`]: createMockCheckReplaceSourceInfo({
      success: true,
      column_mappings: [
        { source: ID_COLUMN, target: ID_COLUMN },
        { source: NAME_COLUMN, target: NAME_COLUMN },
        { source: AMOUNT_COLUMN, target: AMOUNT_COLUMN },
      ],
    }),
    [`table:${TARGET_EXTRA_COLUMNS.id}`]: createMockCheckReplaceSourceInfo({
      success: true,
      column_mappings: [
        { source: ID_COLUMN, target: ID_COLUMN },
        { source: NAME_COLUMN, target: NAME_COLUMN },
        { source: AMOUNT_COLUMN, target: AMOUNT_COLUMN },
        { target: EXTRA_COLUMN },
      ],
    }),
    [`table:${TARGET_TYPE_MISMATCH.id}`]: createMockCheckReplaceSourceInfo({
      success: false,
      column_mappings: [
        { source: ID_COLUMN, target: ID_COLUMN },
        { source: NAME_COLUMN, target: NAME_COLUMN },
        {
          source: AMOUNT_COLUMN,
          target: TEXT_AMOUNT_COLUMN,
          errors: ["column-type-mismatch"],
        },
      ],
    }),
    [`table:${TARGET_MISSING_COLUMN.id}`]: createMockCheckReplaceSourceInfo({
      success: false,
      column_mappings: [
        { source: ID_COLUMN, target: ID_COLUMN },
        { source: NAME_COLUMN, target: NAME_COLUMN },
        { source: AMOUNT_COLUMN },
      ],
    }),
    [`card:${QUESTION_ON_SOURCE.id}`]: createMockCheckReplaceSourceInfo({
      success: false,
      errors: ["cycle-detected"],
      column_mappings: [
        { source: ID_COLUMN, target: ID_COLUMN },
        { source: NAME_COLUMN, target: NAME_COLUMN },
        { source: AMOUNT_COLUMN, target: AMOUNT_COLUMN },
      ],
    }),
  };

  const DEPENDENTS = [
    createDependentQuestion(30, "Q1 plain"),
    createDependentQuestion(31, "Q2 filtered"),
    createDependentQuestion(32, "Q3 count"),
  ];

  function createReplacementTable(id: number, displayName: string) {
    return createMockTable({
      id,
      db_id: DATABASE.id,
      db: DATABASE,
      schema: "public",
      name: displayName.toLowerCase().replace(/ /g, "_"),
      display_name: displayName,
    });
  }

  function createDependentQuestion(id: number, name: string) {
    return createMockCardDependencyNode({
      id,
      data: createMockCardDependencyNodeData({ name, type: "question" }),
    });
  }

  type ReplacementSetupOpts = {
    dependents?: DependencyNode[];
    sourceErrors?: SourceReplacementErrorType[];
  };

  function setupReplacement({
    dependents = DEPENDENTS,
    sourceErrors = [],
  }: ReplacementSetupOpts = {}) {
    setupListSourceReplacementRunsEndpoint([]);
    setupTablesBulkEndpoints();
    setupDatabasesEndpoints([DATABASE]);
    setupCollectionsEndpoints({
      collections: [ROOT_COLLECTION, PERSONAL_COLLECTION],
    });
    setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
    setupCollectionItemsEndpoint({
      collection: PERSONAL_COLLECTION,
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: ROOT_COLLECTION,
      collectionItems: [
        createMockCollectionItem({
          id: QUESTION_ON_SOURCE.id,
          model: "card",
          name: QUESTION_ON_SOURCE.name,
          database_id: DATABASE.id,
        }),
      ],
    });
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    [
      SOURCE_TABLE,
      COMPATIBLE_TARGET,
      TARGET_EXTRA_COLUMNS,
      TARGET_TYPE_MISMATCH,
      TARGET_MISSING_COLUMN,
    ].forEach((table) => setupTableEndpoints(table));
    fetchMock.get(
      `path:/api/card/${QUESTION_ON_SOURCE.id}`,
      QUESTION_ON_SOURCE,
    );
    setupSearchEndpoints([
      ...[
        COMPATIBLE_TARGET,
        TARGET_EXTRA_COLUMNS,
        TARGET_TYPE_MISMATCH,
        TARGET_MISSING_COLUMN,
      ].map((table) =>
        createMockSearchResult({
          id: table.id,
          model: "table",
          name: table.display_name,
          table_id: Number(table.id),
          table_schema: "public",
          database_id: DATABASE.id,
          database_name: DATABASE.name,
          collection: ROOT_COLLECTION,
        }),
      ),
    ]);

    fetchMock.get("path:/api/ee/dependencies/graph/dependents", (call) => {
      const params = new URL(call.url).searchParams;
      const isSource =
        params.get("id") === String(SOURCE_TABLE.id) &&
        params.get("type") === "table";
      return isSource ? dependents : [];
    });

    fetchMock.post(
      "path:/api/ee/replacement/check-replace-source",
      async (call) => {
        const body = JSON.parse(String(call.options.body));
        const isSource =
          body.source_entity_id === SOURCE_TABLE.id &&
          body.source_entity_type === "table";
        const checkInfo =
          CHECK_INFO_BY_TARGET_KEY[
            `${body.target_entity_type}:${body.target_entity_id}`
          ];
        if (!isSource || checkInfo == null) {
          return { status: 404 };
        }
        if (sourceErrors.length === 0) {
          return checkInfo;
        }
        return {
          ...checkInfo,
          success: false,
          errors: [...(checkInfo.errors ?? []), ...sourceErrors],
        };
      },
    );

    fetchMock.post("path:/api/ee/replacement/replace-source", { run_id: 1 });

    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "token-features": createMockTokenFeatures({ dependencies: true }),
      }),
    });
    setupEnterprisePlugins();
    mockGetBoundingClientRect();

    renderWithProviders(
      <Route path="/" element={<TableActionsMenu table={SOURCE_TABLE} />} />,
      { storeInitialState: state, withRouter: true, withUndos: true },
    );
  }

  async function openReplacementModal() {
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const findAndReplaceItem = await screen.findByRole("menuitem", {
      name: /Find and replace/,
    });
    // disabled until the list of active replacement runs loads
    await waitFor(() => expect(findAndReplaceItem).toBeEnabled());
    await userEvent.click(findAndReplaceItem);
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Find and replace a data source"),
    ).toBeInTheDocument();
    // the source picker shows the table the menu was opened for
    expect(await within(modal).findByText("Source Table")).toBeInTheDocument();
    return modal;
  }

  async function openTargetPicker(modal: HTMLElement) {
    await userEvent.click(
      within(modal).getByRole("button", {
        name: /Pick a table, model, or saved question/,
      }),
    );
    return screen.findByTestId("entity-picker-modal");
  }

  async function waitForPickerToClose() {
    await waitFor(() => {
      expect(
        screen.queryByTestId("entity-picker-modal"),
      ).not.toBeInTheDocument();
    });
  }

  async function pickTarget(modal: HTMLElement, name: string) {
    const picker = await openTargetPicker(modal);
    await userEvent.type(
      await within(picker).findByPlaceholderText("Search…"),
      name,
    );
    const result = await within(picker).findByTestId("result-item");
    await userEvent.click(within(result).getByText(name));
    await waitForPickerToClose();
  }

  function getReplaceButton(modal: HTMLElement) {
    return within(modal).getByRole("button", { name: /^Replace data source/ });
  }

  async function getCheckRequestBody() {
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/replacement/check-replace-source",
    );
    return JSON.parse(String(call?.options.body));
  }

  function getDependentsRequestParams() {
    return fetchMock.callHistory
      .calls("path:/api/ee/dependencies/graph/dependents")
      .map((call) => {
        const params = new URL(call.url).searchParams;
        return { id: params.get("id"), type: params.get("type") };
      });
  }

  it("blocks the replacement when nothing uses the source table", async () => {
    setupReplacement({ dependents: [] });
    const modal = await openReplacementModal();
    await pickTarget(modal, "Compatible Target");

    expect(
      await within(modal).findByText(
        "Nothing uses this data source, so there's nothing to replace.",
      ),
    ).toBeInTheDocument();
    expect(getReplaceButton(modal)).toBeDisabled();
    expect(getDependentsRequestParams()).toEqual([
      { id: String(SOURCE_TABLE.id), type: "table" },
    ]);
  });

  it("blocks the replacement when a target column has a different type", async () => {
    setupReplacement();
    const modal = await openReplacementModal();
    await pickTarget(modal, "Target Type Mismatch");

    expect(
      await within(modal).findByRole("tab", { name: "Column comparison" }),
    ).toBeInTheDocument();
    expect(
      await within(modal).findByText(
        "This column has a different data type than the original column.",
      ),
    ).toBeInTheDocument();
    expect(getReplaceButton(modal)).toBeDisabled();
    expect(await getCheckRequestBody()).toEqual({
      source_entity_id: SOURCE_TABLE.id,
      source_entity_type: "table",
      target_entity_id: TARGET_TYPE_MISMATCH.id,
      target_entity_type: "table",
    });
  });

  it("blocks the replacement when the target misses a column", async () => {
    setupReplacement();
    const modal = await openReplacementModal();
    await pickTarget(modal, "Target Missing Column");

    expect(
      await within(modal).findByRole("tab", { name: "Column comparison" }),
    ).toBeInTheDocument();
    expect(
      await within(modal).findByText("This data source isn't compatible."),
    ).toBeInTheDocument();
    expect(getReplaceButton(modal)).toBeDisabled();
    expect(await getCheckRequestBody()).toMatchObject({
      target_entity_id: TARGET_MISSING_COLUMN.id,
      target_entity_type: "table",
    });
  });

  it("blocks the replacement when the target is based on the source", async () => {
    setupReplacement();
    const modal = await openReplacementModal();
    const picker = await openTargetPicker(modal);
    await userEvent.click(await within(picker).findByText("Our analytics"));
    await userEvent.click(
      await within(picker).findByText("Question on source"),
    );
    await waitForPickerToClose();

    expect(
      await within(modal).findByText(
        "The replacement data source can't be based on the original data source.",
      ),
    ).toBeInTheDocument();
    expect(getReplaceButton(modal)).toBeDisabled();
    expect(await getCheckRequestBody()).toEqual({
      source_entity_id: SOURCE_TABLE.id,
      source_entity_type: "table",
      target_entity_id: QUESTION_ON_SOURCE.id,
      target_entity_type: "card",
    });
  });

  it.each([
    {
      name: "the source table has a sandbox policy",
      error: "affects-gtap-policies" as const,
      message:
        "This table has row or column security policies that block this replacement.",
    },
    {
      name: "another table has a foreign key to the source table",
      error: "incompatible-implicit-joins" as const,
      message:
        "The original table can't be referenced by a foreign key by another table.",
    },
  ])("blocks the replacement when $name", async ({ error, message }) => {
    setupReplacement({ sourceErrors: [error] });
    const modal = await openReplacementModal();
    await pickTarget(modal, "Compatible Target");

    expect(await within(modal).findByText(message)).toBeInTheDocument();
    expect(getReplaceButton(modal)).toBeDisabled();
  });

  it("replaces the source with a target that has extra columns", async () => {
    setupReplacement();
    const modal = await openReplacementModal();
    await pickTarget(modal, "Target Extra Columns");

    expect(
      await within(modal).findByRole("tab", { name: "Column comparison" }),
    ).toBeInTheDocument();
    expect(await within(modal).findByText("extra_field")).toBeInTheDocument();
    await userEvent.click(
      await within(modal).findByRole("tab", {
        name: "3 items will be changed",
      }),
    );
    expect(await within(modal).findByText("Q2 filtered")).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByRole("button", {
        name: "Replace data source in 3 items",
      }),
    );
    const confirmation = await screen.findByRole("dialog", {
      name: "Really replace the data sources in these 3 items?",
    });
    await userEvent.click(
      within(confirmation).getByRole("button", {
        name: "Replace data source in 3 items",
      }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/replacement/replace-source"),
      ).toHaveLength(1);
    });
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/replacement/replace-source",
    );
    expect(JSON.parse(String(call?.options.body))).toEqual({
      source_entity_id: SOURCE_TABLE.id,
      source_entity_type: "table",
      target_entity_id: TARGET_EXTRA_COLUMNS.id,
      target_entity_type: "table",
    });
    await waitFor(() => {
      expect(
        screen.queryByText("Find and replace a data source"),
      ).not.toBeInTheDocument();
    });
  });
});
