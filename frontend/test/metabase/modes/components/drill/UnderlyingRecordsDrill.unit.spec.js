/* eslint-disable flowtype/require-valid-file-annotation */

import { ORDERS, PEOPLE } from "__support__/sample_dataset_fixture";

import { assocIn } from "icepick";
import moment from "moment";

import UnderlyingRecordsDrill from "metabase/modes/components/drill/UnderlyingRecordsDrill";

function getActionProps(query, value) {
  return {
    question: query.question(),
    clicked: {
      column: query.aggregationDimensions()[0].column(),
      value: 42,
      dimensions: [
        {
          column: query
            .breakouts()[0]
            .dimension()
            .column(),
          value: value,
        },
      ],
    },
  };
}

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
      .breakout([
        "datetime-field",
        ["field-id", ORDERS.CREATED_AT.id],
        "month",
      ]);
    const actions = UnderlyingRecordsDrill(getActionProps(query, value));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();
    expect(q.query().query()).toEqual({
      "source-table": ORDERS.id,
      filter: [
        "=",
        ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "month"],
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
        "datetime-field",
        ["field-id", ORDERS.CREATED_AT.id],
        "day-of-week",
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
        ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day-of-week"],
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
        ["field-id", ORDERS.USER_ID.id],
        ["joined-field", "User", ["field-id", PEOPLE.ID.id]],
      ],
    };
    const query = ORDERS.query()
      .join(join)
      .aggregate(["count"])
      .breakout(["joined-field", "User", ["field-id", PEOPLE.STATE.id]]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      "source-table": ORDERS.id,
      joins: [join],
      filter: [
        "=",
        ["joined-field", "User", ["field-id", PEOPLE.STATE.id]],
        "CA",
      ],
    });
    expect(q.display()).toEqual("table");
  });

  it("should return the correct new card for breakout on a nested query", () => {
    const query = ORDERS.query()
      .aggregate(["count"])
      .breakout(ORDERS.USER_ID.foreign(PEOPLE.STATE))
      .nest()
      .aggregate(["count"])
      .breakout(["field-literal", "STATE", "type/Text"]);

    const actions = UnderlyingRecordsDrill(getActionProps(query, "CA"));
    expect(actions).toHaveLength(1);
    const q = actions[0].question();

    expect(q.query().query()).toEqual({
      filter: ["=", ["field-literal", "STATE", "type/Text"], "CA"],
      "source-query": {
        "source-table": ORDERS.id,
        aggregation: [["count"]],
        breakout: [["fk->", ["field-id", 7], ["field-id", 19]]],
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
          [
            "fk->",
            ["field-id", ORDERS.USER_ID.id],
            ["field-id", PEOPLE.STATE.id],
          ],
          "CA",
        ],
        [">", ["field-id", ORDERS.TOTAL.id], 42],
      ],
      "source-table": 1,
    });
    expect(q.display()).toEqual("table");
  });
});
