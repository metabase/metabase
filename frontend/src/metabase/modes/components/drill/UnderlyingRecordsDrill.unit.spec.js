import { assocIn } from "icepick";
import moment from "moment-timezone";
import { ORDERS, PEOPLE } from "__support__/sample_database_fixture";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { getMetadata } from "metabase/selectors/metadata";
import UnderlyingRecordsDrill from "./UnderlyingRecordsDrill";

describe("UnderlyingRecordsDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(
      UnderlyingRecordsDrill({ question: ORDERS.newQuestion() }),
    ).toHaveLength(0);
  });

  it("should be return correct new card for breakout by month", () => {
    const value = "2018-01-01T00:00:00Z";
    const query = ORDERS.query()
      .aggregate(["count"])
      .breakout(["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }]);
    const actions = UnderlyingRecordsDrill(getActionProps(query, value));
    expect(actions).toHaveLength(1);

    const q = actions[0].question();
    expect(q.query().query()).toEqual({
      "source-table": ORDERS.id,
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }],
        value,
      ],
    });
    expect(q.display()).toEqual("table");
  });

  it("should be return correct new card for breakout by day-of-week", () => {
    const value = 4; // corresponds to Wednesday
    const query = ORDERS.query()
      .aggregate(["count"])
      .breakout([
        "field",
        ORDERS.CREATED_AT.id,
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
      "source-table": ORDERS.id,
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day-of-week" }],
        null,
      ],
    });
    expect(q.display()).toEqual("table");
  });

  it("should return the correct new card for breakout on a joined column", () => {
    const join = {
      alias: "User",
      "source-table": PEOPLE.id,
      condition: [
        "=",
        ["field", ORDERS.USER_ID.id, null],
        ["field", PEOPLE.ID.id, { "join-alias": "User" }],
      ],
    };
    const query = ORDERS.query()
      .join(join)
      .aggregate(["count"])
      .breakout(["field", PEOPLE.STATE.id, { "join-alias": "User" }]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      "source-table": ORDERS.id,
      joins: [join],
      filter: ["=", ["field", PEOPLE.STATE.id, { "join-alias": "User" }], "CA"],
    });
    expect(q.display()).toEqual("table");
  });

  it("should return the correct new card for breakout on a nested query", () => {
    const query = ORDERS.query()
      .aggregate(["count"])
      .breakout(ORDERS.USER_ID.foreign(PEOPLE.STATE))
      .nest()
      .aggregate(["count"])
      .breakout(["field", "STATE", { "base-type": "type/Text" }]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      filter: ["=", ["field", "STATE", { "base-type": "type/Text" }], "CA"],
      "source-query": {
        "source-table": ORDERS.id,
        aggregation: [["count"]],
        breakout: [["field", 19, { "source-field": 7 }]],
      },
    });
    expect(q.display()).toEqual("table");
  });

  it("should include the filter that's part of the aggregation (e.x. count-where)", () => {
    const query = ORDERS.query()
      .aggregate(["count-where", [">", ORDERS.TOTAL.dimension().mbql(), 42]])
      .breakout(ORDERS.USER_ID.foreign(PEOPLE.STATE));

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      filter: [
        "and",
        [
          "=",
          ["field", PEOPLE.STATE.id, { "source-field": ORDERS.USER_ID.id }],
          "CA",
        ],
        [">", ["field", ORDERS.TOTAL.id, null], 42],
      ],
      "source-table": 1,
    });
    expect(q.display()).toEqual("table");
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
