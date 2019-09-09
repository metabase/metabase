/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  clickedMetric,
  clickedDateTimeValue,
  ORDERS,
} from "__support__/sample_dataset_fixture";

import { chain } from "icepick";

import ZoomDrill from "metabase/modes/components/drill/ZoomDrill";

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(ZoomDrill({ question })).toHaveLength(0);
  });
  it("should be return correct new for month -> week", () => {
    const actions = ZoomDrill({
      question: question
        .query()
        .setQuery({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "month"],
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
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      filter: [
        "=",
        ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "month"],
        clickedDateTimeValue.value,
      ],
      breakout: [
        ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "week"],
      ],
    });
    expect(newCard.display).toEqual("line");
  });
});
