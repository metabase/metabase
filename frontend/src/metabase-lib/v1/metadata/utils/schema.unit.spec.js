import { generateSchemaId, getSchemaName, parseSchemaId } from "./schema";

const SCHEMA_TEST_CASES = [
  { dbId: 1, schemaName: 2, schema: "1:2" },
  { dbId: 1, schemaName: "2", schema: "1:2" },
  { dbId: 1, schema: "1:" },
  {
    dbId: -1337,
    schemaName: "Collection",
    schema: "-1337:Collection",
  },
];

describe("generateSchemaId", () => {
  SCHEMA_TEST_CASES.forEach((testCase) => {
    const { dbId, schemaName, schema } = testCase;

    it(`returns "${schema}" for "${dbId}" DB and ${schemaName} schema`, () => {
      expect(generateSchemaId(dbId, schemaName)).toBe(schema);
    });
  });
});

describe("parseSchemaId", () => {
  SCHEMA_TEST_CASES.forEach((testCase) => {
    const { schema, dbId, schemaName } = testCase;

    const expectedDatabaseId = dbId;
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

  it("handles colons inside schema name", () => {
    const databaseId = -1337;
    const collectionName = "test:collection";

    const schemaId = generateSchemaId(databaseId, collectionName);
    const [decodedDatabaseId, decodedCollectionName] = parseSchemaId(schemaId);

    expect({
      databaseId: decodedDatabaseId,
      collectionName: decodedCollectionName,
    }).toEqual({ databaseId, collectionName });
  });

  it("handles colons when the schema id is already decoded", () => {
    const schemaId = "1:database:name";
    const [decodedDatabaseId, decodedSchemaName] = parseSchemaId(schemaId);
    expect({
      databaseId: decodedDatabaseId,
      schemaName: decodedSchemaName,
    }).toEqual({ databaseId: 1, schemaName: "database:name" });
  });
});

describe("getSchemaName", () => {
  SCHEMA_TEST_CASES.forEach((testCase) => {
    const { schema, schemaName } = testCase;
    const expectedSchemaName = schemaName ? String(schemaName) : "";

    it(`returns "${expectedSchemaName}" for "${schema}"`, () => {
      expect(getSchemaName(schema)).toBe(expectedSchemaName);
    });
  });
});
