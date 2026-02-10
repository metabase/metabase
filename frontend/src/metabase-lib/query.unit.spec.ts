import * as Lib from "metabase-lib";
import {
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

import {
  DEFAULT_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
  createQuery,
} from "./test-helpers";

describe("fromJsQuery", () => {
  // this is a very important optimization that the FE heavily relies upon
  it("should return the same object for the same database id, query, and metadata", () => {
    const metadataProvider = Lib.metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
    const query1 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    const query2 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    expect(query1 === query2).toBe(true);
  });
});

describe("toLegacyQuery", () => {
  it("should serialize a query", () => {
    const query = createQuery();
    expect(Lib.toLegacyQuery(query)).toEqual(DEFAULT_QUERY);
  });
});

describe("suggestedName", () => {
  it("should suggest a query name", () => {
    const query = createQuery();
    expect(Lib.suggestedName(query)).toBe("Orders");
  });
});

describe("stageIndexes", () => {
  it("should return stage indexes for a single-stage query", () => {
    const query = createQuery();
    expect(Lib.stageIndexes(query)).toEqual([0]);
  });

  it("should return stage indexes for a multi-stage query", () => {
    const query = Lib.appendStage(Lib.appendStage(createQuery()));
    expect(Lib.stageIndexes(query)).toEqual([0, 1, 2]);
  });
});

describe("createTestQuery", () => {
  describe("source", () => {
    it("should create a query with a table source", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
          },
        ],
      });
      expect(Lib.sourceTableOrCardId(query)).toBe(PRODUCTS_ID);
    });
  });

  describe("fields", () => {
    it("should create a query with fields", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            fields: [
              {
                type: "column",
                name: "ID",
              },
              {
                type: "column",
                name: "VENDOR",
              },
            ],
          },
        ],
      });

      const fields = Lib.fields(query, 0);
      expect(fields).toHaveLength(2);

      expect(Lib.displayInfo(query, 0, fields[0])).toMatchObject({
        name: "ID",
      });
      expect(Lib.displayInfo(query, 0, fields[1])).toMatchObject({
        name: "VENDOR",
      });
    });
  });

  describe("expressions", () => {
    it("should create a query with expressions", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            expressions: [
              {
                name: "Foo",
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    { type: "column", name: "ID" },
                    { type: "literal", value: 42 },
                  ],
                },
              },
            ],
          },
        ],
      });

      const expressions = Lib.expressions(query, 0);
      expect(expressions).toHaveLength(1);

      expect(Lib.displayInfo(query, 0, expressions[0])).toMatchObject({
        displayName: "Foo",
      });
    });
  });

  describe("breakouts", () => {
    it("should create a query with breakouts", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            breakouts: [{ type: "column", name: "CATEGORY" }],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Category",
      });
    });

    it("should create a query with temporal breakouts", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Created At: Month",
      });
    });

    it("should create a query with breakouts with binning based on count", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            breakouts: [
              {
                type: "column",
                name: "RATING",
                bins: 10,
              },
            ],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Rating: 10 bins",
      });
    });

    it("should create a query with breakouts with binning based on width", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PEOPLE_ID,
            },
            breakouts: [
              {
                type: "column",
                name: "LATITUDE",
                sourceName: "PEOPLE",
                binWidth: 10,
              },
            ],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Latitude: 10°",
      });
    });
  });

  describe("joins", () => {
    it("should create a query with joins", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            joins: [
              {
                source: {
                  type: "table",
                  id: PEOPLE_ID,
                },
                strategy: "inner-join",
                conditions: [
                  {
                    operator: "=",
                    left: {
                      type: "column",
                      name: "VENDOR",
                    },
                    right: {
                      type: "operator",
                      operator: "+",
                      args: [
                        {
                          type: "column",
                          name: "ID",
                        },
                        {
                          type: "literal",
                          value: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      });

      const joins = Lib.joins(query, -1);
      expect(joins).toHaveLength(1);

      const conditions = Lib.joinConditions(joins[0]);
      expect(conditions).toHaveLength(1);

      expect(Lib.displayInfo(query, -1, conditions[0])).toMatchObject({
        displayName: "Vendor is ID + 1",
      });
    });

    it("should create a query with joins that have binning", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            joins: [
              {
                source: {
                  type: "table",
                  id: PEOPLE_ID,
                },
                strategy: "inner-join",
                conditions: [
                  {
                    operator: "=",
                    left: {
                      type: "column",
                      name: "CREATED_AT",
                      unit: "month",
                    },
                    right: {
                      type: "column",
                      name: "CREATED_AT",
                      unit: "month",
                    },
                  },
                ],
              },
            ],
          },
        ],
      });

      const joins = Lib.joins(query, -1);
      expect(joins).toHaveLength(1);

      const conditions = Lib.joinConditions(joins[0]);
      expect(conditions).toHaveLength(1);

      expect(Lib.displayInfo(query, -1, conditions[0])).toMatchObject({
        displayName: "Created At: Month is Created At: Month",
      });
    });

    it("should create a query with suggested joins", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            joins: [
              {
                source: {
                  type: "table",
                  id: PRODUCTS_ID,
                },
                strategy: "inner-join",
              },
            ],
          },
        ],
      });

      const joins = Lib.joins(query, -1);
      expect(joins).toHaveLength(1);

      const conditions = Lib.joinConditions(joins[0]);
      expect(conditions).toHaveLength(1);

      expect(Lib.displayInfo(query, -1, conditions[0])).toMatchObject({
        displayName: "Product ID is ID",
      });
    });
  });

  describe("filters", () => {
    it("should create a query with filters", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            filters: [
              {
                type: "operator",
                operator: ">=",
                args: [
                  { type: "column", name: "PRICE" },
                  { type: "literal", value: 100 },
                ],
              },
            ],
          },
        ],
      });

      const filters = Lib.filters(query, -1);
      expect(filters).toHaveLength(1);

      expect(Lib.displayInfo(query, -1, filters[0])).toMatchObject({
        displayName: "Price is greater than or equal to 100",
      });
    });
  });

  describe("aggregations", () => {
    it("should create a query with aggregations", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            aggregations: [
              {
                type: "operator",
                operator: ">=",
                args: [
                  { type: "column", name: "PRICE" },
                  { type: "literal", value: 100 },
                ],
              },
            ],
          },
        ],
      });

      const aggregations = Lib.aggregations(query, -1);
      expect(aggregations).toHaveLength(1);

      expect(Lib.displayInfo(query, -1, aggregations[0])).toMatchObject({
        displayName: "Price is greater than or equal to 100",
      });
    });
  });

  describe("order bys", () => {
    it("should create a query with order bys", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            orderBys: [{ type: "column", name: "CATEGORY" }],
          },
        ],
      });

      const orderBys = Lib.orderBys(query, 0);
      expect(orderBys).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, orderBys[0])).toMatchObject({
        displayName: "Category",
      });
    });
  });

  describe("limit", () => {
    it("should create a query with a limit", () => {
      const LIMIT = 42;
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            limit: LIMIT,
          },
        ],
      });

      expect(Lib.currentLimit(query, 0)).toBe(LIMIT);
    });
  });
});

describe("createTestNativeQuery", () => {
  it.each(["text", "number", "date", "boolean"] as const)(
    "should create a native query with a %s tag",
    (type) => {
      const queryText = "SELECT * FROM ORDERS WHERE ID = {{x}} ";
      const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
        query: queryText,
        templateTags: {
          x: {
            type,
          },
        },
      });

      expect(Lib.rawNativeQuery(query)).toBe(queryText);
      expect(Lib.templateTags(query)).toEqual({
        x: {
          id: expect.any(String),
          type,
          name: "x",
          "display-name": "X",
        },
      });
    },
  );

  it("should create a native query with a dimension template tag", () => {
    const queryText = "SELECT * FROM ORDERS WHERE {{x}}";
    const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
      query: queryText,
      templateTags: {
        x: {
          type: "dimension",
          dimension: PRODUCTS.CATEGORY,
        },
      },
    });

    expect(Lib.rawNativeQuery(query)).toBe(queryText);
    expect(Lib.templateTags(query)).toEqual({
      x: {
        id: expect.any(String),
        type: "dimension",
        name: "x",
        "display-name": "X",
        dimension: ["field", PRODUCTS.CATEGORY, {}],
        "widget-type": "text",
      },
    });
  });

  it("should create a native query with a temporal unit template tag", () => {
    const queryText = "SELECT * FROM ORDERS WHERE {{x}}";
    const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
      query: queryText,
      templateTags: {
        x: {
          type: "temporal-unit",
          dimension: PRODUCTS.CREATED_AT,
        },
      },
    });

    expect(Lib.rawNativeQuery(query)).toBe(queryText);
    expect(Lib.templateTags(query)).toEqual({
      x: {
        id: expect.any(String),
        type: "temporal-unit",
        name: "x",
        "display-name": "X",
        dimension: ["field", PRODUCTS.CREATED_AT, {}],
      },
    });
  });

  it("should create a native query with a snippet tag", () => {
    const queryText = "SELECT * FROM ORDERS WHERE {{snippet: foo}}";
    const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
      query: queryText,
      templateTags: {
        "snippet: foo": {
          type: "snippet",
          "snippet-id": 12,
        },
      },
    });

    expect(Lib.rawNativeQuery(query)).toBe(queryText);
    expect(Lib.templateTags(query)).toEqual({
      "snippet: foo": {
        id: expect.any(String),
        type: "snippet",
        name: "snippet: foo",
        "snippet-id": 12,
        "snippet-name": "foo",
        "display-name": "Snippet: Foo",
      },
    });
  });

  it("should create a native query with a card tag", () => {
    const queryText = "SELECT * FROM ORDERS WHERE {{#1-users}}";
    const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
      query: queryText,
      templateTags: {
        "#1-users": {
          type: "card",
        },
      },
    });

    expect(Lib.rawNativeQuery(query)).toBe(queryText);
    expect(Lib.templateTags(query)).toEqual({
      "#1-users": {
        id: expect.any(String),
        type: "card",
        name: "#1-users",
        "display-name": "#1 Users",
        "card-id": 1,
      },
    });
  });
});
