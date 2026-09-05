import {
  createMockImplicitQueryAction,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  getActionItems,
  getDefaultFieldSettings,
  getDefaultFormSettings,
  isValidImplicitDeleteAction,
  isValidImplicitUpdateAction,
  sortActionParams,
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
