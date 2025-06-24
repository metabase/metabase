import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type * as React from "react";

import {
  setupCardEndpoints,
  setupDatabaseListEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { Modal } from "metabase/ui";
import type {
  Collection,
  Database,
  ListActionItem,
  ModelWithActionsItem,
  RegularCollectionId,
  SchemaName,
  Table,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  createMockModelActions,
  createMockModelWithActions,
  createMockTableActions,
} from "metabase-types/api/mocks/actionsV2";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { TableOrModelActionPicker } from "./TableOrModelActionPicker";

const mockSearchItem = createMockCollectionItem({
  collection: createMockCollection(),
  model: "dataset",
});
const sampleDb = createMockDatabase({ id: 101, name: "SampleDB" });
const postgresDb = createMockDatabase({
  id: 102,
  engine: "Postgres",
  name: "PostgresDB",
});
const mockTable = createOrdersTable({ id: 301, db_id: sampleDb.id });
const mockTable2 = createPeopleTable({ id: 302, db_id: sampleDb.id });
const mockTable3 = createProductsTable({
  id: 303,
  db_id: sampleDb.id,
  schema: "SCHEMA-2",
});
const mockTable4 = createReviewsTable({
  id: 304,
  db_id: postgresDb.id,
  schema: "POSTSCHEMA",
});
const mockTable5 = createOrdersTable({
  db_id: sampleDb.id,
  id: 305,
  name: "ORDERS_COPY",
  display_name: "Orders table copy",
  schema: "POSTSCHEMA",
});
const rootCollection = createMockCollection({
  id: "root",
  name: "Our Analytics",
});
const collection2 = createMockCollection({
  id: 102,
  name: "Another cool collection",
});

const TABLE_ACTIONS_HIERARCHY = {
  // db -> schema
  [sampleDb.id]: ["Public", "Schema-2"],
  [postgresDb.id]: ["Postschema"],

  // schema -> tables
  ["Public"]: [mockTable, mockTable2],
  ["Schema-2"]: [mockTable3],
  ["Postschema"]: [mockTable4, mockTable5],

  // tables -> actions
  [mockTable.id]: createMockTableActions(),
  [mockTable2.id]: createMockTableActions(),
  [mockTable3.id]: createMockTableActions(),
  [mockTable4.id]: createMockTableActions(),
  [mockTable5.id]: createMockTableActions(),
};

const rootCollectionModel1 = createMockModelWithActions({
  id: 301,
  name: "Orders model",
});
const rootCollectionModel2 = createMockModelWithActions({
  id: 302,
  name: "People model",
});
const collection2Model1 = createMockModelWithActions({
  id: 303,
  name: "Modelio",
  collection_id: collection2.id as RegularCollectionId,
  collection_name: collection2.name,
});
const collection2Model2 = createMockModelWithActions({
  id: 304,
  name: "Other cool model",
  collection_id: collection2.id as RegularCollectionId,
  collection_name: collection2.name,
});

const MODEL_ACTIONS_HIERARCHY = {
  [rootCollection.id]: [rootCollectionModel1, rootCollectionModel2],
  [collection2.id]: [collection2Model1, collection2Model2],
  [rootCollectionModel1.id]: createMockModelActions(),
  [rootCollectionModel2.id]: createMockModelActions(),
  [collection2Model1.id]: createMockModelActions(),
  [collection2Model2.id]: createMockModelActions(),
};

describe("TableOrModelActionPicker", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should display tables hierarchy", async () => {
    await setup();

    expect(screen.getByText("Pick an action to add")).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();

    expect(screen.getByText("SampleDB")).toBeInTheDocument();
  });

  describe("tables", () => {
    it("should display tables hierarchy", async () => {
      await setup();

      await userEvent.click(screen.getByText(sampleDb.name));
      await waitForLoaderToBeRemoved();

      TABLE_ACTIONS_HIERARCHY[sampleDb.id].forEach((schema) => {
        expect(screen.getByText(schema)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText(postgresDb.name));
      await waitForLoaderToBeRemoved();

      TABLE_ACTIONS_HIERARCHY[postgresDb.id].forEach((schema) => {
        const tables = TABLE_ACTIONS_HIERARCHY[schema] as Table[];

        tables.forEach((table) => {
          expect(screen.getByText(table.display_name)).toBeInTheDocument();
        });
      });
    });

    it("should allow to pick an action", async () => {
      const { onChangeSpy } = await setup();

      await userEvent.click(screen.getByText("SampleDB"));

      await userEvent.click(screen.getByText("Public"));

      await userEvent.click(screen.getByText(mockTable.display_name));

      await waitForLoaderToBeRemoved();

      const tableActions = TABLE_ACTIONS_HIERARCHY[
        mockTable.id
      ] as ListActionItem[];
      tableActions.forEach((actionItem) => {
        expect(screen.getByText(actionItem.name)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Create or Update"));

      const expectedAction = checkNotNull(
        tableActions.find(({ name }) => name === "Create or Update"),
      );

      expect(onChangeSpy).toHaveBeenCalledTimes(1);
      expect(onChangeSpy).toHaveBeenLastCalledWith({
        id: expectedAction.id,
        model: "action",
        name: expectedAction.name,
      });
    });

    it("should not display databases if there is only one option", async () => {
      await setup({
        dbs: [postgresDb], // postgresDb has a single schema, so db and schema step should be skipped
      });

      expect(screen.queryByText("SampleDB")).not.toBeInTheDocument();
      expect(screen.queryByText("PostgresDB")).not.toBeInTheDocument();

      await waitForLoaderToBeRemoved();

      TABLE_ACTIONS_HIERARCHY["Postschema"].forEach((table) => {
        expect(screen.getByText(table.display_name)).toBeInTheDocument();
      });
    });
  });

  describe("models", () => {
    it("should not render models tab if models are not enabled", async () => {
      await setup({
        hasModelsEnabled: false,
      });

      expect(screen.getByText("Pick an action to add")).toBeInTheDocument();
      expect(screen.queryByText("Tables")).not.toBeInTheDocument();
      expect(screen.queryByText("Models")).not.toBeInTheDocument();

      expect(screen.getByText("SampleDB")).toBeInTheDocument();
    });

    it("should display models hierarchy", async () => {
      await setup();

      await userEvent.click(screen.getByText("Models"));

      await waitForLoaderToBeRemoved();

      [rootCollection, collection2].forEach(({ name }) => {
        expect(screen.getByText(name)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText(rootCollection.name));
      await waitForLoaderToBeRemoved();

      MODEL_ACTIONS_HIERARCHY[rootCollection.id].forEach((models) => {
        expect(screen.getByText(models.name)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText(collection2.name));
      await waitForLoaderToBeRemoved();

      MODEL_ACTIONS_HIERARCHY[collection2.id].forEach((models) => {
        expect(screen.getByText(models.name)).toBeInTheDocument();
      });
    });

    it("should allow to pick an action", async () => {
      const { onChangeSpy } = await setup();

      await userEvent.click(screen.getByText("Models"));

      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByText(rootCollection.name));
      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByText(rootCollectionModel1.name));
      await waitForLoaderToBeRemoved();

      const modelActions = MODEL_ACTIONS_HIERARCHY[
        rootCollectionModel1.id
      ] as ListActionItem[];
      modelActions.forEach((actionItem) => {
        expect(screen.getByText(actionItem.name)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Delete"));

      const expectedAction = checkNotNull(
        modelActions.find(({ name }) => name === "Delete"),
      );

      expect(onChangeSpy).toHaveBeenCalledTimes(1);
      expect(onChangeSpy).toHaveBeenLastCalledWith({
        id: expectedAction.id,
        model: "action",
        name: expectedAction.name,
      });
    });

    it("should not display collections if there is only one option", async () => {
      await setup({
        collections: [rootCollection],
      });

      await userEvent.click(screen.getByText("Models"));

      await waitForLoaderToBeRemoved();

      expect(screen.queryByText(rootCollection.name)).not.toBeInTheDocument();
      expect(screen.queryByText(collection2.name)).not.toBeInTheDocument();

      MODEL_ACTIONS_HIERARCHY[rootCollection.id].forEach((models) => {
        expect(screen.getByText(models.name)).toBeInTheDocument();
      });
    });

    it("should allow to create a new action for selected model", async () => {
      await setup();

      await userEvent.click(screen.getByText("Models"));

      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByText(collection2.name));
      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByText(collection2Model1.name));

      const createNewActionButton = screen.getByText("Create a new action");
      expect(createNewActionButton).toBeInTheDocument();
      expect(createNewActionButton).toBeEnabled();

      await userEvent.click(createNewActionButton);
      await waitForLoaderToBeRemoved();

      expect(screen.getByTestId("action-creator")).toBeInTheDocument();
    });
  });
});

async function setup(
  options: Partial<React.ComponentProps<typeof TableOrModelActionPicker>> & {
    hasModelsEnabled?: boolean;
    dbs?: Database[];
    collections?: Collection[];
    tableHierarchy?: Record<
      string,
      Database | SchemaName[] | Table[] | ListActionItem[]
    >;
    modelHierarchy?: Record<
      string,
      Collection | ModelWithActionsItem[] | ListActionItem[]
    >;
  } = {},
) {
  const {
    hasModelsEnabled = true,
    dbs = [sampleDb, postgresDb],
    collections = [rootCollection, collection2],
    tableHierarchy = TABLE_ACTIONS_HIERARCHY,
    modelHierarchy = MODEL_ACTIONS_HIERARCHY,
    ...props
  } = options;
  const onChangeSpy = jest.fn();
  const onCloseSpy = jest.fn();

  setupSearchEndpoints(hasModelsEnabled ? [mockSearchItem] : []);
  setupRecentViewsAndSelectionsEndpoints([]);

  fetchMock.get("path:/api/action/v2/database", {
    databases: dbs,
  });

  dbs.forEach((db) => {
    const schemas = tableHierarchy[db.id] as string[];

    const tables = schemas
      .map((schema) => tableHierarchy[schema] as Table[])
      .flat();

    fetchMock.get(`path:/api/action/v2/database/${db.id}/table`, {
      tables: tables || [],
    });

    tables.forEach(({ id: tableId }) => {
      const actionItems = tableHierarchy[tableId] as ListActionItem[];
      fetchMock.get(
        (url) => url.endsWith(`api/action/v2/?table-id=${tableId}`),
        {
          actions: actionItems,
        },
      );
    });
  });

  const models = collections
    .map(({ id }) => modelHierarchy[id] as ModelWithActionsItem[])
    .flat();

  fetchMock.get(`path:/api/action/v2/model`, {
    models: models || [],
  });

  models.forEach((model) => {
    const actionItems = modelHierarchy[model.id] as ListActionItem[];

    fetchMock.get(
      (url) => url.endsWith(`api/action/v2/?model-id=${model.id}`),
      {
        actions: actionItems,
      },
    );

    setupCardEndpoints(createMockCard({ id: model.id, name: model.name }));
  });

  setupDatabaseListEndpoint(dbs);

  const { debug } = renderWithProviders(
    <Modal.Root opened onClose={onCloseSpy}>
      <TableOrModelActionPicker
        value={undefined}
        initialDbId={undefined}
        onChange={onChangeSpy}
        onClose={onCloseSpy}
        {...props}
      />
    </Modal.Root>,
  );

  await waitForLoaderToBeRemoved();

  return {
    debug,
    onChangeSpy,
    onCloseSpy,
  };
}
