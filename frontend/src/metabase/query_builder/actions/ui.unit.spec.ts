import { CANCEL_QUESTION_CHANGES } from "metabase/redux/query-builder";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { createMockCard } from "metabase-types/api/mocks";

import { cancelQuestionChanges } from "./ui";

function setup() {
  const originalCard = createMockCard({ id: 1 });

  const dispatch = jest.fn();
  const getState = () =>
    createMockState({ qb: createMockQueryBuilderState({ originalCard }) });

  return { originalCard, dispatch, getState };
}

describe("QB Actions > cancelQuestionChanges", () => {
  // Regression guard for metabase#48024: cancelling metric creation/editing used
  // to unconditionally re-run the (dirty) question query from inside this thunk,
  // which crashed when there was nothing valid to run. The fix moved the query
  // rerun out to the call sites, so the thunk must only restore the card state.
  it("restores the original card without triggering a query rerun", () => {
    const { originalCard, dispatch, getState } = setup();

    cancelQuestionChanges()(dispatch, getState);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: CANCEL_QUESTION_CHANGES,
      payload: { card: originalCard },
    });
  });
});
