import mock from "xhr-mock";
import { assocIn } from "icepick";

import { getStore } from "__support__/entities-store";

import Databases from "metabase/entities/databases";
import { MetabaseApi } from "metabase/services";

describe("database entity", () => {
  let store;
  beforeEach(() => {
    store = getStore();
    mock.setup();
  });

  afterEach(() => mock.teardown());

  it("should save database metadata in redux", async () => {
    mock.get("/api/database/123/metadata", {
      body: JSON.stringify({
        id: 123,
        tables: [{ schema: "public", id: 234, db_id: 123, fields: [] }],
      }),
    });

    await store.dispatch(
      Databases.objectActions.fetchDatabaseMetadata({ id: 123 }),
    );

    const { databases, schemas, tables } = store.getState().entities;
    expect(databases).toEqual({
      "123": {
        id: 123,
        tables: [234],
        is_saved_questions: false,
      },
    });
    expect(schemas).toEqual({
      "123:public": {
        database: 123,
        id: "123:public",
        name: "public",
      },
    });
    expect(tables).toEqual({
      "234": {
        db_id: 123,
        fields: [],
        id: 234,
        schema: "123:public",
        schema_name: "public",
      },
    });
  });

  describe("updating database", () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    const TEST_DB = { id: 50, name: "Test DB", details: { foo: "bar" } };

    function setup({
      isModelPersistenceEnabledGlobally = false,
      isModelPersistenceSupportedByDB = false,
      isModelPersistenceEnabledForDB = false,
    } = {}) {
      const settingsState = {
        values: {
          "persisted-models-enabled": isModelPersistenceEnabledGlobally,
        },
      };
      const extraReducers = {
        settings: () => settingsState,
      };

      const databaseFeatures = [
        isModelPersistenceSupportedByDB && "persist-models",
        isModelPersistenceSupportedByDB &&
          isModelPersistenceEnabledForDB &&
          "persist-models-enabled",
      ].filter(Boolean);

      const storeInitialState = {
        settings: settingsState,
        entities: {
          databases: {
            [TEST_DB]: {
              ...TEST_DB,
              features: databaseFeatures,
            },
          },
        },
      };

      const store = getStore(extraReducers, storeInitialState);

      const dbUpdateMock = jest
        .spyOn(Databases.api, "update")
        .mockResolvedValue(TEST_DB);

      const enablePersistenceMock = jest
        .spyOn(MetabaseApi, "db_persist")
        .mockResolvedValue({});
      const disablePersistenceMock = jest
        .spyOn(MetabaseApi, "db_unpersist")
        .mockResolvedValue({});

      return {
        store,
        dbUpdateMock,
        enablePersistenceMock,
        disablePersistenceMock,
      };
    }

    it("should send an update request", async () => {
      const { store, dbUpdateMock } = setup();
      const database = { ...TEST_DB, name: "New name" };

      await store.dispatch(Databases.actions.update(database));

      expect(dbUpdateMock).toHaveBeenCalledWith(database);
    });

    it("should enable model persistence", async () => {
      const {
        store,
        dbUpdateMock,
        enablePersistenceMock,
        disablePersistenceMock,
      } = setup({
        isModelPersistenceEnabledGlobally: true,
        isModelPersistenceSupportedByDB: true,
        isModelPersistenceEnabledForDB: false,
      });
      const database = assocIn(TEST_DB, ["details", "_persistModels"], true);

      await store.dispatch(Databases.actions.update(database));

      expect(dbUpdateMock).toHaveBeenCalledWith(TEST_DB);
      expect(enablePersistenceMock).toHaveBeenCalledWith({ dbId: database.id });
      expect(disablePersistenceMock).not.toHaveBeenCalled();
    });

    it("should disable model persistence", async () => {
      const {
        store,
        dbUpdateMock,
        enablePersistenceMock,
        disablePersistenceMock,
      } = setup({
        isModelPersistenceEnabledGlobally: true,
        isModelPersistenceSupportedByDB: true,
        isModelPersistenceEnabledForDB: true,
      });
      const database = assocIn(TEST_DB, ["details", "_persistModels"], false);

      await store.dispatch(Databases.actions.update(database));

      expect(dbUpdateMock).toHaveBeenCalledWith(TEST_DB);
      expect(disablePersistenceMock).toHaveBeenCalledWith({
        dbId: database.id,
      });
      expect(enablePersistenceMock).not.toHaveBeenCalled();
    });

    it("should not toggle model persistence if it hasn't changed", async () => {
      const {
        store,
        dbUpdateMock,
        enablePersistenceMock,
        disablePersistenceMock,
      } = setup({
        isModelPersistenceEnabledGlobally: true,
        isModelPersistenceSupportedByDB: true,
        isModelPersistenceEnabledForDB: false,
      });
      const database = { ...TEST_DB, name: "New name" };

      await store.dispatch(Databases.actions.update(database));

      expect(dbUpdateMock).toHaveBeenCalledWith(database);
      expect(enablePersistenceMock).not.toHaveBeenCalled();
      expect(disablePersistenceMock).not.toHaveBeenCalled();
    });

    it("should not try to enable model persistence if it's disabled globally", async () => {
      const { store, enablePersistenceMock, disablePersistenceMock } = setup({
        isModelPersistenceEnabledGlobally: false,
        isModelPersistenceSupportedByDB: true,
        isModelPersistenceEnabledForDB: false,
      });
      const database = assocIn(TEST_DB, ["details", "_persistModels"], true);

      await store.dispatch(Databases.actions.update(database));

      expect(enablePersistenceMock).not.toHaveBeenCalled();
      expect(disablePersistenceMock).not.toHaveBeenCalled();
    });

    it("should not try to enable model persistence if it's not supported by DB", async () => {
      const { store, enablePersistenceMock, disablePersistenceMock } = setup({
        isModelPersistenceEnabledGlobally: true,
        isModelPersistenceSupportedByDB: false,
        isModelPersistenceEnabledForDB: false,
      });
      const database = assocIn(TEST_DB, ["details", "_persistModels"], true);

      await store.dispatch(Databases.actions.update(database));

      expect(enablePersistenceMock).not.toHaveBeenCalled();
      expect(disablePersistenceMock).not.toHaveBeenCalled();
    });

    it("should not try to disable model persistence if it's disabled globally", async () => {
      const { store, enablePersistenceMock, disablePersistenceMock } = setup({
        isModelPersistenceEnabledGlobally: false,
        isModelPersistenceSupportedByDB: true,
        isModelPersistenceEnabledForDB: true,
      });
      const database = assocIn(TEST_DB, ["details", "_persistModels"], false);

      await store.dispatch(Databases.actions.update(database));

      expect(enablePersistenceMock).not.toHaveBeenCalled();
      expect(disablePersistenceMock).not.toHaveBeenCalled();
    });
  });
});
