import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createTestJsQuery,
} from "metabase-lib/test-helpers";
import { ORDERS_ID, PEOPLE_ID } from "metabase-types/api/mocks/presets";

describe("createTestQuery", () => {
  it("should create a query with stages", () => {
    expect(() => {
      const provider = Lib.metadataProvider(
        SAMPLE_DATABASE.id,
        SAMPLE_METADATA,
      );
      const query = createTestJsQuery(provider, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            limit: 101,
            fields: [
              {
                type: "column",
                table: "ORDERS",
                name: "ID",
              },
            ],
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
                      name: "USER_ID",
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
            filters: [
              {
                type: "operator",
                operator: ">=",
                args: [
                  {
                    type: "column",
                    table: "ORDERS", // TODO: get rid of this
                    name: "TOTAL",
                  },
                  {
                    type: "literal",
                    value: 10,
                  },
                ],
              },
            ],
            aggregations: [
              {
                name: "Foo",
                value: {
                  type: "operator",
                  operator: "avg",
                  args: [
                    {
                      type: "column",
                      table: "ORDERS", // TODO: get rid of this?
                      name: "TOTAL",
                    },
                  ],
                },
              },
            ],
            breakouts: [
              {
                table: "ORDERS",
                name: "TOTAL",
                binningCount: 10,
              },
            ],
            expressions: [
              {
                name: "Derp",
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    { type: "literal", value: 1 },
                    { type: "literal", value: 50 },
                  ],
                },
              },
            ],
            orderBy: [
              {
                name: "TOTAL",
                table: "ORDERS",
                direction: "desc",
              },
            ],
          },
        ],
      });

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(query, null, 2));
    }).not.toThrow();
  });
});
