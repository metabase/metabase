/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  clickedMetric,
  clickedDateTimeValue,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import { chain } from "icepick";

import ZoomDrill from "metabase/qb/components/drill/ZoomDrill";

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(ZoomDrill({ question })).toHaveLength(0);
  });
  it("should be return correct new for month -> week", () => {
    const actions = ZoomDrill({
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
              "month",
            ],
          ],
        })
        .question(),
      clicked: {
        ...clickedMetric,
        dimensions: [
          chain(clickedDateTimeValue)
            .assocIn(["column", "unit"], "month")
            .value(),
        ],
      },
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS_TABLE_ID,
      aggregation: [["count"]],
      filter: [
        "=",
        [
          "datetime-field",
          ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          "as",
          "month",
        ],
        clickedDateTimeValue.value,
      ],
      breakout: [
        [
          "datetime-field",
          ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          // "as",
          "week",
        ],
      ],
    });
    expect(newCard.display).toEqual("line");
  });
});
