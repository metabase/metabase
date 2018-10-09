/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  clickedMetric,
  clickedDateTimeValue,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import { assocIn, chain } from "icepick";
import moment from "moment";

import UnderlyingRecordsDrill from "metabase/qb/components/drill/UnderlyingRecordsDrill";

function getActionPropsForTimeseriesClick(unit, value) {
  return {
    question: question
      .query()
      .setQuery({
        "source-table": ORDERS_TABLE_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "datetime-field",
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
            "as",
            unit,
          ],
        ],
      })
      .question(),
    clicked: {
      ...clickedMetric,
      dimensions: [
        chain(clickedDateTimeValue)
          .assocIn(["column", "unit"], unit)
          .assocIn(["value"], value)
          .value(),
      ],
    },
  };
}

describe("UnderlyingRecordsDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(UnderlyingRecordsDrill({ question })).toHaveLength(0);
  });
  it("should be return correct new card for breakout by month", () => {
    const value = "2018-01-01T00:00:00Z";
    const actions = UnderlyingRecordsDrill(
      getActionPropsForTimeseriesClick("month", value),
    );
    expect(actions).toHaveLength(1);
    const q = actions[0].question();
    expect(q.query().query()).toEqual({
      "source-table": ORDERS_TABLE_ID,
      filter: [
        "=",
        [
          "datetime-field",
          ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          "as",
          "month",
        ],
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
      "source-table": ORDERS_TABLE_ID,
      filter: [
        "=",
        [
          "datetime-field",
          ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          "as",
          "day-of-week",
        ],
        null,
      ],
    });
    expect(q.display()).toEqual("table");
  });
});
