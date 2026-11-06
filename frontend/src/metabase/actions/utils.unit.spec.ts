import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockImplicitQueryAction,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getActionDisplayType,
  getActionItems,
  getDefaultFieldSettings,
  getDefaultFormSettings,
  isValidImplicitDeleteAction,
  isValidImplicitUpdateAction,
  sortActionParams,
  supportsImplicitActions,
} from "./utils";

const createParameter = (options?: any) => {
  return {
    id: "test_parameter",
    name: "Test Parameter",
    type: "type/Text",
    ...options,
  };
};

describe("sortActionParams", () => {
  const formSettings = getDefaultFormSettings({
    fields: {
      a: getDefaultFieldSettings({ order: 0 }),
      b: getDefaultFieldSettings({ order: 1 }),
      c: getDefaultFieldSettings({ order: 2 }),
    },
  });

  it("should return a sorting function", () => {
    const sortFn = sortActionParams(formSettings);
    expect(typeof sortFn).toBe("function");
  });

  it("should sort params by the settings-defined field order", () => {
    const sortFn = sortActionParams(formSettings);

    const params = [
      createParameter({ id: "c" }),
      createParameter({ id: "a" }),
      createParameter({ id: "b" }),
    ];

    const sortedParams = params.sort(sortFn);

    expect(sortedParams[0].id).toEqual("a");
    expect(sortedParams[1].id).toEqual("b");
    expect(sortedParams[2].id).toEqual("c");
  });
});

const ACTIONS_ENABLED_DB_ID = 10;

const ACTIONS_DISABLED_DB_ID = 11;

const databaseWithEnabledActions = createSampleDatabase({
  id: ACTIONS_ENABLED_DB_ID,
  settings: { "database-enable-actions": true },
});

const databaseWithDisabledActions = createSampleDatabase({
  id: ACTIONS_DISABLED_DB_ID,
  settings: { "database-enable-actions": false },
});

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

describe("getActionDisplayType", () => {
  it("uses the given display type first", () => {
    expect(
      getActionDisplayType("button", {
        visualization_settings: { type: "form" },
      }),
    ).toBe("button");
  });

  it("falls back to the action's display type", () => {
    expect(
      getActionDisplayType(undefined, {
        visualization_settings: { type: "form" },
      }),
    ).toBe("form");
  });

  it("defaults to a button when neither sets it", () => {
    expect(getActionDisplayType(undefined, undefined)).toBe("button");
    expect(getActionDisplayType(undefined, {})).toBe("button");
  });
});

describe("supportsImplicitActions", () => {
  const ORDERS_SOURCE = { type: "table", id: ORDERS_ID } as const;

  it("should support raw table query with single primary key", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: ORDERS_SOURCE }],
    });
    expect(supportsImplicitActions(query)).toBe(true);
  });

  it("should not support query with aggregations", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: ORDERS_SOURCE,
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    });
    expect(supportsImplicitActions(query)).toBe(false);
  });

  it("should not support query with expressions", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: ORDERS_SOURCE,
          expressions: [
            { name: "Total copy", value: { type: "column", name: "TOTAL" } },
          ],
        },
      ],
    });
    expect(supportsImplicitActions(query)).toBe(false);
  });

  it("should not support native query", () => {
    const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
      query: "SELECT * FROM ORDERS",
    });
    expect(supportsImplicitActions(query)).toBe(false);
  });

  it("should not support table without primary key", () => {
    const provider = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [
              createOrdersTable({
                fields: [
                  createOrdersIdField({ semantic_type: "type/Integer" }),
                  createOrdersTotalField(),
                ],
              }),
            ],
          }),
        ],
      }),
    });
    const query = Lib.createTestQuery(provider, {
      stages: [{ source: ORDERS_SOURCE }],
    });
    expect(supportsImplicitActions(query)).toBe(false);
  });
});
