import { assocIn } from "icepick";
import moment from "moment-timezone";
import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import UnderlyingRecordsDrill from "./UnderlyingRecordsDrill";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

describe("UnderlyingRecordsDrill", () => {
  it("should not be valid for top level actions", () => {
    const question = ordersTable.newQuestion();
    const actions = UnderlyingRecordsDrill({ question });
    expect(actions).toHaveLength(0);
  });

  it("should return correct new card for breakout by month", () => {
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

  it("should return correct new card for breakout by day-of-week", () => {
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

  it("should return correct new card for aggregated query with a top level custom column", () => {
    const customColumnExpression = [
      "field",
      "count",
      {
        "base-type": "type/Integer",
      },
    ];
    const query = ordersTable
      .query()
      .aggregate(["count"])
      .breakout(["field", ORDERS.PRODUCT_ID, null])
      .addExpression("Test column", customColumnExpression);
    const testProductId = 1;

    const actions = UnderlyingRecordsDrill({
      question: query.question(),
      clicked: {
        column: metadata.field(ORDERS.PRODUCT_ID).column(),
        value: testProductId,
        dimensions: [
          {
            column: query.breakouts()[0].dimension().column(),
            value: testProductId,
          },
          {
            column: null,
            value: 123,
          },
        ],
      },
    });

    expect(actions).toHaveLength(1);

    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      expressions: {
        "Test column": customColumnExpression,
      },
      filter: ["=", ["field", ORDERS.PRODUCT_ID, null], testProductId],
      "source-table": ORDERS_ID,
    });
  });

  describe("title", () => {
    it('should return "See these records" title for entities with title longer than 20 chars', () => {
      const actions = UnderlyingRecordsDrill(setup("LongLongLongTableTitle"));
      expect(actions).toHaveLength(1);

      const [action] = actions;
      if (!("title" in action)) {
        throw new Error("Received unexpected action type");
      }

      expect(action.title).toEqual("See these records");
    });

    it("should contain entity title for entities shorter than 21 chars", () => {
      const actions = UnderlyingRecordsDrill(setup("SomeTitle"));
      expect(actions).toHaveLength(1);

      const [action] = actions;
      expect(action.title).toEqual("See these SomeTitles");
    });
  });
});

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

function getMockTable(tableDisplayName) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  const table = metadata.table(ORDERS_ID);

  table.display_name = tableDisplayName;

  return table;
}

function setup(tableDisplayName) {
  const table = getMockTable(tableDisplayName);

  return {
    question: table.newQuestion(),
    clicked: {
      column: table.fields[0].column(),
      value: 42,
      dimensions: [
        {
          column: table.fields[0].column(),
          value: 42,
        },
      ],
    },
  };
}
