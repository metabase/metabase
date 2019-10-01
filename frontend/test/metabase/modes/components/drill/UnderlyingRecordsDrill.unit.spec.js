/* eslint-disable flowtype/require-valid-file-annotation */

import { ORDERS } from "__support__/sample_dataset_fixture";

import { assocIn } from "icepick";
import moment from "moment";

import UnderlyingRecordsDrill from "metabase/modes/components/drill/UnderlyingRecordsDrill";

function getActionPropsForTimeseriesClick(unit, value) {
  const query = ORDERS.query()
    .aggregate(["count"])
    .breakout(["datetime-field", ["field-id", ORDERS.CREATED_AT.id], unit]);
  return {
    question: query.question(),
    clicked: {
      column: query.aggregationDimensions()[0].column(),
      value: 42,
      dimensions: [
        {
          column: ORDERS.CREATED_AT.column({ unit }),
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
    const actions = UnderlyingRecordsDrill(
      getActionPropsForTimeseriesClick("month", value),
    );
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
    const actions = UnderlyingRecordsDrill(
      getActionPropsForTimeseriesClick("day-of-week", value),
    );
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
});
