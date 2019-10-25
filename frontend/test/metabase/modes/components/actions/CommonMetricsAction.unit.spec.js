/* eslint-disable flowtype/require-valid-file-annotation */

import {
  ORDERS,
  MAIN_METRIC_ID,
  createMetadata,
} from "__support__/sample_dataset_fixture";
import _ from "underscore";

import CommonMetricsAction from "metabase/modes/components/actions/CommonMetricsAction";

function questionWithMetrics(count) {
  const metadata = createMetadata(state =>
    state.assocIn(
      ["entities", "tables", ORDERS.id, "metrics"],
      _.range(count).map(() => MAIN_METRIC_ID),
    ),
  );
  return metadata.table(ORDERS.id).question();
}

describe("CommonMetricsAction", () => {
  it("should not be valid if the table has no metrics", () => {
    expect(
      CommonMetricsAction({
        question: questionWithMetrics(0),
      }),
    ).toHaveLength(0);
  });
  it("should return a scalar card for the metric", () => {
    const actions = CommonMetricsAction({
      question: questionWithMetrics(1),
    });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["metric", MAIN_METRIC_ID]],
    });
    expect(newCard.display).toEqual("scalar");
  });
  it("should only return up to 5 actions", () => {
    expect(
      CommonMetricsAction({
        question: questionWithMetrics(6),
      }),
    ).toHaveLength(5);
  });
});
