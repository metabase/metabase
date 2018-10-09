/* eslint-disable flowtype/require-valid-file-annotation */

import {
  question,
  questionNoFields,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import CountByTimeAction from "metabase/qb/components/actions/CountByTimeAction";

describe("CountByTimeAction", () => {
  it("should not be valid if the table has no metrics", () => {
    expect(CountByTimeAction({ question: questionNoFields })).toHaveLength(0);
  });
  it("should return a scalar card for the metric", () => {
    const actions = CountByTimeAction({ question: question });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS_TABLE_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "datetime-field",
          ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          "as",
          "day",
        ],
      ],
    });
    expect(newCard.display).toEqual("bar");
  });
});
