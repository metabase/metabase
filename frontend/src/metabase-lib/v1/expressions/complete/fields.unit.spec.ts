import { createMockMetadata } from "__support__/metadata";
import { SAMPLE_DATABASE, createQuery } from "metabase-lib/test-helpers";
import type { DatasetQuery, Join } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  REVIEWS,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";

import { sharedMetadata } from "../__support__/shared";

import { complete } from "./__support__";
import { suggestFields } from "./fields";

describe("suggestFields", () => {
  function setup() {
    const NAME = createMockField({
      id: 1,
      name: "NAME",
      display_name: "Name",
      base_type: "type/String",
    });

    const EMAIL = createMockField({
      id: 2,
      name: "EMAIL",
      display_name: "Email",
      semantic_type: "type/Email",
      base_type: "type/String",
    });

    const SEATS = createMockField({
      id: 3,
      name: "SEATS",
      display_name: "Seats",
      base_type: "type/Integer",
    });

    const TABLE = createMockTable({
      fields: [NAME, EMAIL, SEATS],
    });

    const DATABASE = createMockDatabase({
      tables: [TABLE],
    });

    const query = createQuery({
      databaseId: DATABASE.id,
      metadata: createMockMetadata({ databases: [DATABASE] }),
      query: {
        database: DATABASE.id,
        type: "query",
        query: {
          "source-table": TABLE.id,
        },
      },
    });

    const source = suggestFields({
      query,
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    from: 0,
    to: 3,
    options: [
      {
        label: "[Email]",
        displayLabel: "Email",
        matches: [[0, 2]],
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Seats]",
        displayLabel: "Seats",
        matches: [[1, 2]],
        type: "field",
        icon: "int",
        column: expect.any(Object),
      },
    ],
  };

  const ALL_RESULTS = {
    from: 0,
    to: 1,
    filter: false,
    options: [
      {
        label: "[Email]",
        displayLabel: "Email",
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Name]",
        displayLabel: "Name",
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Seats]",
        displayLabel: "Seats",
        type: "field",
        icon: "int",
        column: expect.any(Object),
      },
    ],
  };

  it("should suggest fields", () => {
    const complete = setup();
    const results = complete("Ema|");
    expect(results).toEqual(RESULTS);
  });

  it("should suggest fields, inside a word", () => {
    const complete = setup();
    const results = complete("Em|a");
    expect(results).toEqual(RESULTS);
  });

  it("should suggest fields when typing [", () => {
    const complete = setup();
    const results = complete("[|");
    expect(results).toEqual(ALL_RESULTS);
  });

  it("should suggest fields when inside []", () => {
    const complete = setup();
    const results = complete("[|]");
    expect(results).toEqual({ ...ALL_RESULTS, to: 2 });
  });

  it("should suggest fields in an open [", () => {
    const complete = setup();
    const results = complete("[Ema|");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });

  it("should suggest fields in an open [, inside a word", () => {
    const complete = setup();
    const results = complete("[Em|a");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });

  it("should suggest fields inside []", () => {
    const complete = setup();
    const results = complete("[Ema|]");
    expect(results).toEqual({ ...RESULTS, to: 5 });
  });

  it("should suggest fields in [], inside a word", () => {
    const complete = setup();
    const results = complete("[Em|a]");
    expect(results).toEqual({ ...RESULTS, to: 5 });
  });

  it("should suggest joined fields", async () => {
    const JOIN_CLAUSE: Join = {
      alias: "Foo",
      ident: "pbHOWTxjodLToOUnFJe_k",
      "source-table": REVIEWS_ID,
      condition: [
        "=",
        ["field", REVIEWS.PRODUCT_ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
    };
    const queryWithJoins: DatasetQuery = {
      database: SAMPLE_DATABASE.id,
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        joins: [JOIN_CLAUSE],
      },
    };

    const query = createQuery({
      metadata: sharedMetadata,
      query: queryWithJoins,
    });

    const source = suggestFields({
      query,
      stageIndex: -1,
      expressionIndex: undefined,
    });

    complete(source, "Foo|");

    const result = await complete(source, "Foo|");

    expect(result).toEqual({
      from: 0,
      to: 3,
      options: expect.any(Array),
    });

    expect(result?.options[0]).toEqual({
      displayLabel: "Foo → Body",
      label: "[Foo → Body]",
      type: "field",
      icon: "string",
      column: expect.any(Object),
      matches: [[0, 2]],
    });
    expect(result?.options[1]).toEqual({
      displayLabel: "Foo → ID",
      label: "[Foo → ID]",
      type: "field",
      icon: "label",
      column: expect.any(Object),
      matches: [[0, 2]],
    });
  });
});
