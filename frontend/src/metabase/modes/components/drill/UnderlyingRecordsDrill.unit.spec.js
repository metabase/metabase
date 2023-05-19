import { assocIn } from "icepick";
import moment from "moment-timezone";
import { createMockMetadata } from "__support__/metadata";

import UnderlyingRecordsDrill from "metabase/modes/components/drill/UnderlyingRecordsDrill";

import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

function getActionProps(query, value) {
  return {
    question: query.question(),
    clicked: {
      column: query.aggregationDimensions()[0].column(),
      value: 42,
      dimensions: [
        {
          column: query.breakouts()[0].dimension().column(),
          value: value,
        },
      ],
    },
  };
}

describe("UnderlyingRecordsDrill", () => {
  it("should not be valid for top level actions", () => {
    const question = ordersTable.newQuestion();
    const actions = UnderlyingRecordsDrill({ question });
    expect(actions).toHaveLength(0);
  });

  it("should be return correct new card for breakout by month", () => {
    const value = "2018-01-01T00:00:00Z";
    const query = ordersTable
      .query()
      .aggregate(["count"])
      .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]);
    const actions = UnderlyingRecordsDrill(getActionProps(query, value));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();
    expect(q.query().query()).toEqual({
      "source-table": ORDERS_ID,
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        value,
      ],
    });
    expect(q.display()).toEqual("table");
  });

  it("should be return correct new card for breakout by day-of-week", () => {
    const value = 4; // corresponds to Wednesday
    const query = ordersTable
      .query()
      .aggregate(["count"])
      .breakout([
        "field",
        ORDERS.CREATED_AT,
        { "temporal-unit": "day-of-week" },
      ]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, value));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    // check that the filter value is a Wednesday
    const filterValue = q.query().query().filter[2];
    expect(moment(filterValue).format("dddd")).toEqual("Wednesday");

    // check that the rest of the query is correct
    const queryWithoutFilterValue = assocIn(
      q.query().query(),
      ["filter", 2],
      null,
    );
    expect(queryWithoutFilterValue).toEqual({
      "source-table": ORDERS_ID,
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
        null,
      ],
    });
    expect(q.display()).toEqual("table");
  });

  it("should return the correct new card for breakout on a joined column", () => {
    const join = {
      alias: "User",
      "source-table": PEOPLE_ID,
      condition: [
        "=",
        ["field", ORDERS.USER_ID, null],
        ["field", PEOPLE.ID, { "join-alias": "User" }],
      ],
    };
    const query = ordersTable
      .query()
      .join(join)
      .aggregate(["count"])
      .breakout(["field", PEOPLE.STATE, { "join-alias": "User" }]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      "source-table": ORDERS_ID,
      joins: [join],
      filter: ["=", ["field", PEOPLE.STATE, { "join-alias": "User" }], "CA"],
    });
    expect(q.display()).toEqual("table");
  });

  it("should return the correct new card for breakout on a nested query", () => {
    const query = ordersTable
      .query()
      .aggregate(["count"])
      .breakout(
        metadata.field(ORDERS.USER_ID).foreign(metadata.field(PEOPLE.STATE)),
      )
      .nest()
      .aggregate(["count"])
      .breakout(["field", "STATE", { "base-type": "type/Text" }]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      filter: ["=", ["field", "STATE", { "base-type": "type/Text" }], "CA"],
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }]],
      },
    });
    expect(q.display()).toEqual("table");
  });

  it("should include the filter that's part of the aggregation (e.x. count-where)", () => {
    const query = ordersTable
      .query()
      .aggregate([
        "count-where",
        [">", metadata.field(ORDERS.TOTAL).dimension().mbql(), 42],
      ])
      .breakout(
        metadata.field(ORDERS.USER_ID).foreign(metadata.field(PEOPLE.STATE)),
      );

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      filter: [
        "and",
        [
          "=",
          ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
          "CA",
        ],
        [">", ["field", ORDERS.TOTAL, null], 42],
      ],
      "source-table": ORDERS_ID,
    });
    expect(q.display()).toEqual("table");
  });
});
