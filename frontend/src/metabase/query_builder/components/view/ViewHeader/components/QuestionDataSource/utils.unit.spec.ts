import { isValidElement } from "react";

import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getDataSourceParts } from "./utils";

const MULTI_SCHEMA_DB_ID = 2;
const MULTI_SCHEMA_TABLE1_ID = 100;
const MULTI_SCHEMA_TABLE2_ID = 101;

function getMetadata() {
  return createMockMetadata({
    databases: [
      createSampleDatabase(),
      createMockDatabase({
        id: MULTI_SCHEMA_DB_ID,
        tables: [
          createMockTable({
            id: MULTI_SCHEMA_TABLE1_ID,
            db_id: MULTI_SCHEMA_DB_ID,
            schema: "first_schema",
          }),
          createMockTable({
            id: MULTI_SCHEMA_TABLE2_ID,
            db_id: MULTI_SCHEMA_DB_ID,
            schema: "second_schema",
          }),
        ],
      }),
    ],
  });
}

const createMockQuestion = (opts?: Partial<Card>) =>
  new Question(createMockCard(opts), getMetadata());

/** These tests cover new logic in the getDataSourceParts utility that is not covered in QuestionDataSource.unit.spec.js */
describe("getDataSourceParts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns an array of Records if formatTableAsComponent is false", () => {
    const parts = getDataSourceParts({
      question: createMockQuestion(),
      subHead: false,
      isObjectDetail: true,
      formatTableAsComponent: false,
    });
    expect(parts).toHaveLength(2);
    const partsArray = parts as any[];
    expect(partsArray[0]).toEqual({
      icon: "database",
      name: "Sample Database",
      href: "/browse/databases/1-sample-database",
      model: "database",
    });
    expect(partsArray[1].name).toEqual("Products");
    expect(partsArray[1].model).toEqual("table");
    expect(partsArray[1].href).toMatch(/^\/question#[a-zA-Z0-9]{50}/);
    expect(Object.keys(partsArray[1])).toHaveLength(3);
  });

  it("returns an array with the table formatted as a component if formatTableAsComponent is true", () => {
    const parts = getDataSourceParts({
      question: createMockQuestion(),
      subHead: false,
      isObjectDetail: true,
      formatTableAsComponent: true,
    });
    expect(parts).toHaveLength(2);
    const partsArray = parts as any[];
    expect(partsArray[0]).toEqual({
      icon: "database",
      name: "Sample Database",
      href: "/browse/databases/1-sample-database",
      model: "database",
    });
    expect(isValidElement(partsArray[1])).toBe(true);
  });
});
