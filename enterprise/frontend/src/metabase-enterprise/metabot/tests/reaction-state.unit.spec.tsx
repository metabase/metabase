import userEvent from "@testing-library/user-event";

import { act } from "__support__/ui";
import {
  addSuggestedTransform,
  getMetabotReactionsState,
  setNavigateToPath,
} from "metabase-enterprise/metabot/state";
import { createMockTransform } from "metabase-types/api/mocks";

import { resetChatButton, setup } from "./utils";

describe("metabot > reaction state", () => {
  it("should clear navigateToPath and suggestedTransforms when resetting omnibot conversation", async () => {
    const { store } = setup();
    const getReactions = () => getMetabotReactionsState(store.getState());

    act(() => {
      store.dispatch(setNavigateToPath("/some/path"));
      store.dispatch(
        addSuggestedTransform({
          ...createMockTransform(),
          active: true,
          suggestionId: "test-suggestion",
        }),
      );
    });

    expect(getReactions().navigateToPath).toBe("/some/path");
    expect(getReactions().suggestedTransforms).toHaveLength(1);

    await userEvent.click(await resetChatButton());

    expect(getReactions().navigateToPath).toBeNull();
    expect(getReactions().suggestedTransforms).toEqual([]);
  });
});
