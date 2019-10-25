/* eslint-disable flowtype/require-valid-file-annotation */

import CompoundQueryAction from "metabase/modes/components/actions/CompoundQueryAction";

import { SAMPLE_DATASET, ORDERS } from "__support__/sample_dataset_fixture";

describe("CompoundQueryAction", () => {
  it("should not suggest a compount query for an unsaved native query", () => {
    const question = SAMPLE_DATASET.nativeQuestion();
    expect(CompoundQueryAction({ question })).toHaveLength(0);
  });
  xit("should suggest a compound query for a mbql query", () => {
    const question = ORDERS.query()
      .aggregate(["count"])
      .question();

    const actions = CompoundQueryAction({ question });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": "card__2",
    });
  });

  it("should return a nested query for a saved native card", () => {
    const question = SAMPLE_DATASET.nativeQuestion().setId(3);

    const actions = CompoundQueryAction({ question });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": "card__3",
    });
  });
});
