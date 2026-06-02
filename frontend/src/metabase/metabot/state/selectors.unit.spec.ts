import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { createConversation, getMetabotInitialState } from "./reducer-utils";

import {
  type MetabotChatMessage,
  getBarChatAgentIds,
  getOverlayAgentId,
  getUserPromptForMessageId,
  getVisibleAgentId,
} from "./index";

function setup(messages: MetabotChatMessage[]): State {
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

  return createMockState({ metabot: withMessages });
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

  describe("bar membership selectors", () => {
    const setupChats = (overlayAgentId: string | null): State => {
      const base = getMetabotInitialState();
      const withChats = {
        ...base,
        conversations: {
          ...base.conversations,
          chat_a: createConversation("chat_a", { inBar: true }),
          chat_b: createConversation("chat_b", { inBar: true }),
          // a full-page conversation that is not docked in the bar
          chat_page: createConversation("chat_page", { inBar: false }),
        },
        overlayAgentId,
      } as typeof base;
      return createMockState({ metabot: withChats });
    };

    it("getOverlayAgentId returns the overlaid agent slot", () => {
      expect(getOverlayAgentId(setupChats("chat_a"))).toBe("chat_a");
      expect(getOverlayAgentId(setupChats(null))).toBeNull();
    });

    it("getBarChatAgentIds returns only inBar agents and excludes the overlaid one", () => {
      expect(getBarChatAgentIds(setupChats(null))).toEqual([
        "chat_a",
        "chat_b",
      ]);
      expect(getBarChatAgentIds(setupChats("chat_a"))).toEqual(["chat_b"]);
    });

    it("getVisibleAgentId ignores a visible conversation that is not in the bar", () => {
      const base = getMetabotInitialState();
      const state = createMockState({
        metabot: {
          ...base,
          conversations: {
            ...base.conversations,
            chat_page: createConversation("chat_page", {
              inBar: false,
              visible: true,
            }),
          },
        } as typeof base,
      });
      expect(getVisibleAgentId(state)).toBeNull();
    });
  });
});
