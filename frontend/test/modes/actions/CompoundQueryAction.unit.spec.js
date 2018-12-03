/* eslint-disable flowtype/require-valid-file-annotation */

import CompoundQueryAction from "../../../src/metabase/qb/components/actions/CompoundQueryAction";

import Question from "metabase-lib/lib/Question";

import {
  native_orders_count_card,
  orders_count_card,
  unsaved_native_orders_count_card,
  metadata,
} from "__support__/sample_dataset_fixture";

describe("CompoundQueryAction", () => {
  it("should not suggest a compount query for an unsaved native query", () => {
    const question = new Question(metadata, unsaved_native_orders_count_card);
    expect(CompoundQueryAction({ question })).toHaveLength(0);
  });
  it("should suggest a compound query for a mbql query", () => {
    const question = new Question(metadata, orders_count_card);

    const actions = CompoundQueryAction({ question });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": "card__2",
    });
  });

  it("should return a nested query for a saved native card", () => {
    const question = new Question(metadata, native_orders_count_card);

    const actions = CompoundQueryAction({ question });
    expect(actions).toHaveLength(1);
    const newCard = actions[0].question().card();
    expect(newCard.dataset_query.query).toEqual({
      "source-table": "card__3",
    });
  });
});
