import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createTestQuery,
} from "metabase-lib/test-helpers";
import { ORDERS_ID, PEOPLE_ID } from "metabase-types/api/mocks/presets";

describe("createTestQuery", () => {
  it("should create a query with stages", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, SAMPLE_METADATA);
    const query = createTestQuery(provider, {
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
              groupName: "Orders",
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

    const customExpressions = Lib.expressions(query, 0).map(
      (expression) => Lib.displayInfo(query, 0, expression).displayName,
    );
    expect(customExpressions).toEqual(["Bar"]);

    const fields = Lib.fields(query, 0).map(
      (field) => Lib.displayInfo(query, -1, field).displayName,
    );
    expect(fields).toEqual(["People → ID", "ID", "Bar"]);

    const joins = Lib.joins(query, 0).map((join) => {
      const joinConditions = Lib.joinConditions(join);
      return joinConditions.map(
        (condition) => Lib.displayInfo(query, 0, condition).longDisplayName,
      );
    });
    expect(joins).toEqual([["User ID is ID + 1"]]);

    const filters = Lib.filters(query, 0).map(
      (filter) => Lib.displayInfo(query, 0, filter).displayName,
    );
    expect(filters).toEqual(["Total is greater than or equal to 10"]);

    const aggregations = Lib.aggregations(query, 0).map(
      (aggregation) => Lib.displayInfo(query, 0, aggregation).displayName,
    );
    expect(aggregations).toEqual(["Foo"]);

    const orderBys = Lib.orderBys(query, 0).map((orderBy) => {
      const info = Lib.displayInfo(query, 0, orderBy);
      return {
        name: info.displayName,
        direction: info.direction,
      };
    });
    expect(orderBys).toEqual([
      { name: "Created At: Month", direction: "desc" },
    ]);

    const limit = Lib.currentLimit(query, 0);
    expect(limit).toEqual(101);
  });
});
