import userEvent from "@testing-library/user-event";

import { act } from "__support__/ui";
import {
  getMetabotReactionsState,
  setNavigateToPath,
} from "metabase/metabot/state";

import { newConversationButton, setup } from "./utils";

describe("metabot > reaction state", () => {
  it("should clear navigateToPath when starting a new omnibot conversation", async () => {
    const { store } = setup();
    const getReactions = () => getMetabotReactionsState(store.getState());

    act(() => {
      store.dispatch(setNavigateToPath("/some/path"));
    });

    expect(getReactions().navigateToPath).toBe("/some/path");

    await userEvent.click(await newConversationButton());

    expect(getReactions().navigateToPath).toBeNull();
  });
});
