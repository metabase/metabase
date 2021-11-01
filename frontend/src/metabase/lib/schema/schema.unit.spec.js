import {
  entityTypeForModel,
  entityTypeForObject,
  getSchemaName,
  parseSchemaId,
  generateSchemaId,
} from "./schema";

describe("schemas", () => {
  const MODEL_ENTITY_TYPE = [
    { model: "card", entityType: "questions" },
    { model: "dataset", entityType: "questions" },
    { model: "dashboard", entityType: "dashboards" },
    { model: "pulse", entityType: "pulses" },
    { model: "collection", entityType: "collections" },
    { model: "segment", entityType: "segments" },
    { model: "metric", entityType: "metrics" },
    { model: "snippet", entityType: "snippets" },
    { model: "snippetCollection", entityType: "snippetCollections" },
  ];

  const SCHEMA_TEST_CASES = [
    { dbId: 1, schemaName: 2, schema: "1:2" },
    { dbId: "1", schemaName: "2", schema: "1:2" },
    { dbId: "1", schema: "1:" },
    {
      dbId: -1337,
      schemaName: "Collection",
      schema: "-1337:Collection",
    },
  ];

  describe("entityTypeForModel", () => {
    MODEL_ENTITY_TYPE.forEach(testCase => {
      const { model, entityType } = testCase;
      it(`returns "${entityType}" for "${model}" model`, () => {
        expect(entityTypeForModel(model)).toBe(entityType);
      });
    });
  });

  describe("entityTypeForObject", () => {
    MODEL_ENTITY_TYPE.forEach(testCase => {
      const { model, entityType } = testCase;
      it(`returns "${entityType}" for "${model}" model`, () => {
        expect(entityTypeForObject({ model })).toBe(entityType);
      });
    });

    it(`handles undefined object`, () => {
      expect(entityTypeForObject()).toBe(undefined);
    });
  });

  describe("generateSchemaId", () => {
    SCHEMA_TEST_CASES.forEach(testCase => {
      const { dbId, schemaName, schema } = testCase;
      it(`returns "${schema}" for "${dbId}" DB and ${schemaName} schema`, () => {
        expect(generateSchemaId(dbId, schemaName)).toBe(schema);
      });
    });

    it("encodes extra payload", () => {
      const payload = { isDataset: true };
      const schema = generateSchemaId(1, 2, payload);
      expect(schema).toBe(`1:2:${JSON.stringify(payload)}`);
    });
  });

  describe("parseSchemaId", () => {
    SCHEMA_TEST_CASES.forEach(testCase => {
      const { schema, dbId, schemaName } = testCase;

      const expectedDatabaseId = String(dbId);
      const expectedSchemaName = schemaName ? String(schemaName) : "";

      it(`parses "${schema}" correctly`, () => {
        const [parsedDatabaseId, parsedSchemaName] = parseSchemaId(schema);
        expect({
          dbId: parsedDatabaseId,
          schemaName: parsedSchemaName,
        }).toEqual({
          dbId: expectedDatabaseId,
          schemaName: expectedSchemaName,
        });
      });
    });

    it("decodes extra payload", () => {
      const payload = { isDataset: true };
      const [dbId, schemaName, decodedPayload] = parseSchemaId(
        `1:2:${JSON.stringify(payload)}`,
      );
      expect({ dbId, schemaName, payload: decodedPayload }).toEqual({
        dbId: "1",
        schemaName: "2",
        payload,
      });
    });

    it("handles colons inside schema name", () => {
      const databaseId = "-1337";
      const collectionName = "test:collection";
      const payload = { foo: "bar" };

      const schemaId = generateSchemaId(databaseId, collectionName, payload);
      const [
        decodedDatabaseId,
        decodedCollectionName,
        decodedPayload,
      ] = parseSchemaId(schemaId);

      expect({
        databaseId: decodedDatabaseId,
        collectionName: decodedCollectionName,
        payload: decodedPayload,
      }).toEqual({ databaseId, collectionName, payload });
    });
  });

  describe("getSchemaName", () => {
    SCHEMA_TEST_CASES.forEach(testCase => {
      const { schema, schemaName } = testCase;
      const expectedSchemaName = schemaName ? String(schemaName) : "";
      it(`returns "${expectedSchemaName}" for "${schema}"`, () => {
        expect(getSchemaName(schema)).toBe(expectedSchemaName);
      });
    });
  });
});
