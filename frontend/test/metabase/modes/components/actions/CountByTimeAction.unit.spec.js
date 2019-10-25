/* eslint-disable flowtype/require-valid-file-annotation */

import { ORDERS, createMetadata } from "__support__/sample_dataset_fixture";

import CountByTimeAction from "metabase/modes/components/actions/CountByTimeAction";

describe("CountByTimeAction", () => {
  it("should not be valid if the table has no date fields", () => {
    const metadata = createMetadata(state =>
      state.assocIn(["entities", "tables", ORDERS.id, "fields"], []),
    );
    expect(
      CountByTimeAction({ question: metadata.table(ORDERS.id).question() }),
    ).toHaveLength(0);
  });
  it("should return a scalar card for the metric", () => {
    const actions = CountByTimeAction({ question: ORDERS.question() });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day"]],
    });
    expect(newCard.display).toEqual("line");
  });
});
