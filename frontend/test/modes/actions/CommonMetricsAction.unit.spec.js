/* eslint-disable flowtype/require-valid-file-annotation */

import {
  makeQuestion,
  ORDERS_TABLE_ID,
  MAIN_METRIC_ID,
} from "__support__/sample_dataset_fixture";

import CommonMetricsAction from "metabase/qb/components/actions/CommonMetricsAction";

import { assocIn } from "icepick";

const question0Metrics = makeQuestion((card, state) => ({
  card,
  state: assocIn(state, ["entities", "tables", ORDERS_TABLE_ID, "metrics"], []),
}));
const question1Metrics = makeQuestion();
const question6Metrics = makeQuestion((card, state) => ({
  card,
  state: assocIn(
    state,
    ["entities", "tables", ORDERS_TABLE_ID, "metrics"],
    [
      MAIN_METRIC_ID,
      MAIN_METRIC_ID,
      MAIN_METRIC_ID,
      MAIN_METRIC_ID,
      MAIN_METRIC_ID,
      MAIN_METRIC_ID,
    ],
  ),
}));

describe("CommonMetricsAction", () => {
  it("should not be valid if the table has no metrics", () => {
    expect(
      CommonMetricsAction({
        question: question0Metrics,
      }),
    ).toHaveLength(0);
  });
  it("should return a scalar card for the metric", () => {
    const actions = CommonMetricsAction({
      question: question1Metrics,
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      source_table: ORDERS_TABLE_ID,
      aggregation: [["METRIC", MAIN_METRIC_ID]],
    });
    expect(newCard.display).toEqual("scalar");
  });
  it("should only return up to 5 actions", () => {
    expect(
      CommonMetricsAction({
        question: question6Metrics,
      }),
    ).toHaveLength(5);
  });
});
