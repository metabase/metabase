import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockColumn,
  createMockDatasetData,
  createMockImplicitQueryAction,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import {
  getActionItems,
  getDisplayId,
  getIdValue,
  getObjectName,
  getSinglePKIndex,
  isValidImplicitDeleteAction,
  isValidImplicitUpdateAction,
} from "./utils";

const ACTIONS_ENABLED_DB_ID = 10;

const ACTIONS_DISABLED_DB_ID = 11;

const card = createSavedStructuredCard({
  name: "Special Order",
});

const database = createSampleDatabase();

const metadata = createMockMetadata({
  databases: [
    database,
    createSampleDatabase({
      id: ACTIONS_ENABLED_DB_ID,
      settings: { "database-enable-actions": true },
    }),
    createSampleDatabase({
      id: ACTIONS_DISABLED_DB_ID,
      settings: { "database-enable-actions": false },
    }),
  ],
  questions: [card],
});

const databaseWithEnabledActions = metadata.database(ACTIONS_ENABLED_DB_ID)!;

const databaseWithDisabledActions = metadata.database(ACTIONS_DISABLED_DB_ID)!;

const implicitCreateAction = createMockImplicitQueryAction({
  database_id: ACTIONS_ENABLED_DB_ID,
  name: "Create",
  kind: "row/create",
});

const implicitDeleteAction = createMockImplicitQueryAction({
  database_id: ACTIONS_ENABLED_DB_ID,
  name: "Delete",
  kind: "row/delete",
});

const implicitUpdateAction = createMockImplicitQueryAction({
  database_id: ACTIONS_ENABLED_DB_ID,
  name: "Update",
  kind: "row/update",
});

describe("ObjectDetail utils", () => {
  const productIdCol = createMockColumn({
    name: "product_id",
    display_name: "Product ID",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/PK",
    table_id: PRODUCTS_ID,
  });

  const idCol = createMockColumn({
    name: "id",
    display_name: "ID",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/PK",
    table_id: ORDERS_ID,
  });

  const qtyCol = createMockColumn({
    name: "qty",
    display_name: "qty",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/int",
    table_id: ORDERS_ID,
  });

  const nameCol = createMockColumn({
    name: "id",
    display_name: "ID",
    base_type: "string",
    effective_type: "string",
    semantic_type: "type/Name",
    table_id: ORDERS_ID,
  });

  const dateCol = createMockColumn({
    name: "date",
    display_name: "Date",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: "type/DateTime",
    table_id: ORDERS_ID,
    unit: "default",
  });

  describe("getObjectName", () => {
    const question = new Question(card, metadata);
    const table = question.legacyQueryTable();

    it("should get an entity name when there is an entity name column", () => {
      const name = getObjectName({
        table: null,
        question: question,
        cols: [idCol, qtyCol, nameCol],
        zoomedRow: [22, 33, "Giant Sprocket"],
      });

      expect(name).toBe("Giant Sprocket");
    });

    it("should get a singularized table name if no entity name is present", () => {
      const name = getObjectName({
        table: table as any,
        question: question,
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Order");
    });

    it("should get a singularized question name if neither table nor entity names are present", () => {
      const name = getObjectName({
        table: null,
        question: question,
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Special Order");
    });

    it("should fall back to default text", () => {
      const name = getObjectName({
        table: null,
        question: new Question(
          {
            ...card,
            name: "",
          },
          metadata,
        ),
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Item Detail");
    });
  });

  describe("getDisplayId", () => {
    it("should get a display id when there is a single primary key column in the table", () => {
      const id = getDisplayId({
        cols: [productIdCol, idCol, qtyCol, nameCol],
        zoomedRow: [11, 22, 33, "Giant Sprocket"],
        tableId: ORDERS_ID,
        settings: {},
      });

      expect(id).toBe("22");
    });

    it("should return null if there is no primary key and an entity name", () => {
      const id = getDisplayId({
        cols: [qtyCol, nameCol],
        zoomedRow: [33, "Giant Sprocket"],
        settings: {},
      });

      expect(id).toBe(null);
    });

    it("should return the first row's value if there is neither an entity name nor a primary key", () => {
      const id = getDisplayId({
        cols: [qtyCol, qtyCol],
        zoomedRow: [33, 44],
        settings: {},
      });

      expect(id).toBe("33");
    });

    it("should format a date value per column remapping settings", () => {
      const id = getDisplayId({
        cols: [dateCol, qtyCol],
        zoomedRow: ["2002-02-14 12:33:33", 33],
        tableId: ORDERS_ID,
        settings: {
          column: () => ({
            column: dateCol,
            date_abbreviate: false,
            date_separator: "/",
            date_style: "MMMM D, YYYY",
            time_enabled: false,
            time_style: "h:mm A",
          }),
        },
      });

      expect(id).toBe("February 14, 2002");
    });
  });

  describe("getIdValue", () => {
    // this code should no longer be reachable now that we always reach object detail by zooming
    it("should return the primary key of the first row if now zoomed row id exists", () => {
      const id = getIdValue({
        data: createMockDatasetData({
          cols: [productIdCol, idCol, qtyCol, nameCol],
          rows: [
            [11, 22, 33, "Giant Sprocket"],
            [33, 44, 55, "Tiny Sprocket"],
          ],
        }),
        tableId: ORDERS_ID,
      });

      expect(id).toBe(22);
    });
  });

  describe("getSinglePKIndex", () => {
    it("should return the index of the single PK column", () => {
      expect(getSinglePKIndex([idCol, qtyCol, nameCol])).toBe(0);
      expect(getSinglePKIndex([qtyCol, idCol, nameCol])).toBe(1);
      expect(getSinglePKIndex([qtyCol, nameCol, idCol])).toBe(2);
    });

    it("should return undefined if there are multiple PKs", () => {
      expect(getSinglePKIndex([idCol, productIdCol, qtyCol, nameCol])).toBe(
        undefined,
      );
    });

    it("should return undefined if there are no PKs", () => {
      expect(getSinglePKIndex([qtyCol, nameCol])).toBe(undefined);
    });
  });

  describe("getActionItems", () => {
    const onDelete = jest.fn();
    const onUpdate = jest.fn();
    const actions = [
      implicitDeleteAction,
      implicitUpdateAction,
      implicitCreateAction,
    ];

    it("should return delete and update action items", () => {
      expect(
        getActionItems({
          actions,
          databases: [databaseWithEnabledActions],
          onDelete,
          onUpdate,
        }),
      ).toMatchObject([
        { title: "Update", icon: "pencil" },
        { title: "Delete", icon: "trash" },
      ]);
    });

    it("should not return any items when database actions are disabled", () => {
      expect(
        getActionItems({
          actions,
          databases: [databaseWithDisabledActions],
          onDelete,
          onUpdate,
        }),
      ).toEqual([]);
    });

    it("should not return any items when there are no databases", () => {
      expect(
        getActionItems({
          actions,
          databases: [],
          onDelete,
          onUpdate,
        }),
      ).toEqual([]);
    });

    it("should not return any items when there are no actions", () => {
      expect(
        getActionItems({
          actions: [],
          databases: [databaseWithDisabledActions, databaseWithEnabledActions],
          onDelete,
          onUpdate,
        }),
      ).toEqual([]);
    });
  });

  describe("isValidImplicitDeleteAction", () => {
    it("should detect implicit delete action", () => {
      expect(isValidImplicitDeleteAction(implicitCreateAction)).toBe(false);
      expect(isValidImplicitDeleteAction(implicitDeleteAction)).toBe(true);
      expect(isValidImplicitDeleteAction(implicitUpdateAction)).toBe(false);
    });

    it("should ignore archived action", () => {
      expect(
        isValidImplicitDeleteAction({
          ...implicitDeleteAction,
          archived: true,
        }),
      ).toBe(false);
    });

    it("should ignore non-implicit action", () => {
      expect(
        isValidImplicitDeleteAction({
          ...implicitDeleteAction,
          type: "query",
          dataset_query: createMockNativeDatasetQuery(),
        }),
      ).toBe(false);
    });
  });

  describe("isValidImplicitUpdateAction", () => {
    it("should detect implicit update action", () => {
      expect(isValidImplicitUpdateAction(implicitCreateAction)).toBe(false);
      expect(isValidImplicitUpdateAction(implicitDeleteAction)).toBe(false);
      expect(isValidImplicitUpdateAction(implicitUpdateAction)).toBe(true);
    });

    it("should ignore archived action", () => {
      expect(
        isValidImplicitUpdateAction({
          ...implicitUpdateAction,
          archived: true,
        }),
      ).toBe(false);
    });

    it("should ignore non-implicit action", () => {
      expect(
        isValidImplicitUpdateAction({
          ...implicitUpdateAction,
          type: "query",
          dataset_query: createMockNativeDatasetQuery(),
        }),
      ).toBe(false);
    });
  });
});
