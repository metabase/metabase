import { act } from "__support__/ui";
import {
  addSuggestedTransform,
  getMetabotReactionsState,
  resetConversation,
} from "metabase/metabot/state";
import { createMockTransform } from "metabase-types/api/mocks";

import { setup } from "./utils";

describe("metabot > reaction state", () => {
  it("should clear suggestedTransforms when resetting omnibot conversation", async () => {
    const { store } = setup();
    const getReactions = () => getMetabotReactionsState(store.getState());

    act(() => {
      store.dispatch(
        addSuggestedTransform({
          ...createMockTransform(),
          active: true,
          suggestionId: "test-suggestion",
        }),
      );
    });

    expect(getReactions().suggestedTransforms).toHaveLength(1);

    await act(async () => {
      await store.dispatch(resetConversation({ agentId: "omnibot" }) as any);
    });

    expect(getReactions().suggestedTransforms).toEqual([]);
  });
});
