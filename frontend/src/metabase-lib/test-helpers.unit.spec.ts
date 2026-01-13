import { SAMPLE_DATABASE, createTestJsQuery } from "metabase-lib/test-helpers";
import { ORDERS_ID, PEOPLE_ID } from "metabase-types/api/mocks/presets";

describe("createTestQuery", () => {
  it("should create a query with stages", () => {
    expect(() => {
      createTestJsQuery({
        databaseId: SAMPLE_DATABASE.id,
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
          },
        ],
      });
    }).not.toThrow();
  });
});
