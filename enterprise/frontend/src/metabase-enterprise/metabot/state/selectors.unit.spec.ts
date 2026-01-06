import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockState } from "metabase-types/store/mocks";

import { getMetabotInitialState } from "./reducer-utils";
import type { MetabotStoreState } from "./types";

import { type MetabotChatMessage, getUserPromptForMessageId } from "./index";

function setup(messages: MetabotChatMessage[]): MetabotStoreState {
  setupEnterprisePlugins();

  const state = getMetabotInitialState();
  const visibleState = assocIn(
    state,
    ["conversations", "omnibot", "visible"],
    true,
  );
  const withMessages = assocIn(
    visibleState,
    ["conversations", "omnibot", "messages"],
    messages,
  );

  return createMockState({
    plugins: {
      metabotPlugin: withMessages,
    },
  } as any) as unknown as MetabotStoreState;
}

describe("metabot selectors", () => {
  describe("getUserPromptForMessageId", () => {
    it("should return the message with the matching id if id is for a user message", () => {
      const state = setup([
        { id: "1", role: "user", type: "text", message: "bleh" },
        { id: "2", role: "agent", type: "text", message: "blah" },
      ]);
      const message = getUserPromptForMessageId(state, "omnibot", "1");
      expect(message).toEqual({
        id: "1",
        role: "user",
        type: "text",
        message: "bleh",
      });
    });

    it("should return the message with the matching id if id is for an agent message", () => {
      const state = setup([
        { id: "1", type: "text", role: "user", message: "bleh" },
        { id: "2", type: "text", role: "agent", message: "blah" },
        { id: "3", type: "text", role: "user", message: "bleh bleh" },
        { id: "4", type: "text", role: "agent", message: "blah blah" },
      ]);
      const message1 = getUserPromptForMessageId(state, "omnibot", "2");
      expect(message1).toEqual({
        id: "1",
        role: "user",
        type: "text",
        message: "bleh",
      });
      const message2 = getUserPromptForMessageId(state, "omnibot", "4");
      expect(message2).toEqual({
        id: "3",
        role: "user",
        type: "text",
        message: "bleh bleh",
      });
    });
  });
});
