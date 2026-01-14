import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createTestJsQuery,
} from "metabase-lib/test-helpers";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";

const uuid = expect.any(String);

describe("createTestQuery", () => {
  it("should create a query with stages", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, SAMPLE_METADATA);
    const query = createTestJsQuery(provider, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          fields: [
            {
              type: "column",
              groupName: "People",
              name: "ID",
            },
            {
              type: "column",
              groupName: "ORDERS",
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
                    name: "TOTAL",
                  },
                ],
              },
            },
          ],
          breakouts: [
            {
              name: "CREATED_AT",
              unit: "month",
            },
          ],
          expressions: [
            {
              name: "Bar",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "SUBTOTAL" },
                  { type: "literal", value: 50 },
                ],
              },
            },
          ],
          orderBy: [
            {
              name: "CREATED_AT",
              direction: "desc",
            },
          ],
          limit: 101,
        },
        {
          expressions: [
            {
              name: "FooPlusOne",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "Foo" },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(query).toEqual({
      "lib/type": "mbql/query",
      database: SAMPLE_DATABASE.id,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": ORDERS_ID,
          joins: [
            {
              "lib/type": "mbql/join",
              stages: [
                {
                  "lib/type": "mbql.stage/mbql",
                  "lib/options": { "lib/uuid": uuid },
                  "source-table": 5,
                },
              ],
              "lib/options": { "lib/uuid": uuid },
              fields: "all",
              conditions: [
                [
                  "=",
                  { "lib/uuid": uuid },
                  [
                    "field",
                    {
                      "lib/uuid": uuid,
                      "effective-type": "type/Integer",
                      "base-type": "type/Integer",
                    },
                    ORDERS.USER_ID,
                  ],
                  [
                    "+",
                    { "lib/uuid": uuid },
                    [
                      "field",
                      {
                        "lib/uuid": uuid,
                        "effective-type": "type/BigInteger",
                        "base-type": "type/BigInteger",
                        "join-alias": "People",
                      },
                      PEOPLE.ID,
                    ],
                    1,
                  ],
                ],
              ],
              strategy: "inner-join",
              alias: "People",
            },
          ],
          fields: [
            [
              "field",
              {
                "lib/uuid": uuid,
                "effective-type": "type/BigInteger",
                "base-type": "type/BigInteger",
                "join-alias": "People",
              },
              PEOPLE.ID,
            ],
            [
              "field",
              {
                "lib/uuid": uuid,
                "effective-type": "type/BigInteger",
                "base-type": "type/BigInteger",
              },
              ORDERS.ID,
            ],
            [
              "expression",
              {
                "lib/uuid": uuid,
                "base-type": "type/Float",
                "effective-type": "type/Float",
              },
              "Bar",
            ],
          ],
          expressions: [
            [
              "+",
              {
                "lib/uuid": uuid,
                "lib/expression-name": "Bar",
              },
              [
                "field",
                {
                  "lib/uuid": uuid,
                  "base-type": "type/Float",
                  "effective-type": "type/Float",
                },
                ORDERS.SUBTOTAL,
              ],
              50,
            ],
          ],
          filters: [
            [
              ">=",
              { "lib/uuid": uuid },
              [
                "field",
                {
                  "lib/uuid": uuid,
                  "effective-type": "type/Float",
                  "base-type": "type/Float",
                },
                ORDERS.TOTAL,
              ],
              10,
            ],
          ],
          aggregation: [
            [
              "avg",
              {
                "lib/uuid": uuid,
                name: "Foo",
                "display-name": "Foo",
              },
              [
                "field",
                {
                  "lib/uuid": uuid,
                  "effective-type": "type/Float",
                  "base-type": "type/Float",
                },
                ORDERS.TOTAL,
              ],
            ],
          ],
          breakout: [
            [
              "field",
              {
                "lib/uuid": uuid,
                "effective-type": "type/DateTime",
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
              ORDERS.CREATED_AT,
            ],
          ],
          "order-by": [
            [
              "desc",
              { "lib/uuid": uuid },
              [
                "field",
                {
                  "lib/uuid": uuid,
                  "effective-type": "type/DateTime",
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
                ORDERS.CREATED_AT,
              ],
            ],
          ],
          limit: 101,
        },
        {
          "lib/type": "mbql.stage/mbql",
          expressions: [
            [
              "+",
              {
                "lib/expression-name": "FooPlusOne",
                "lib/uuid": uuid,
              },
              [
                "field",
                {
                  "base-type": "type/Float",
                  "effective-type": "type/Float",
                  "lib/uuid": uuid,
                },
                "Foo",
              ],
              1,
            ],
          ],
        },
      ],
    });
  });
});
