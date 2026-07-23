import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { getMetabotInitialState } from "./reducer-utils";

import {
  type MetabotChatMessage,
  getLastAgentMessageExternalId,
  getUserPromptForMessageId,
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

  describe("getLastAgentMessageExternalId", () => {
    it("skips a trailing tool_call and returns the last agent message that carries an externalId", () => {
      const state = setup([
        { id: "1", role: "user", type: "text", message: "hi" },
        {
          id: "2",
          role: "agent",
          type: "text",
          message: "working on it",
          externalId: "ext-2",
        },
        {
          id: "3",
          role: "agent",
          type: "tool_call",
          name: "search",
          status: "ended",
        },
      ]);
      expect(getLastAgentMessageExternalId(state, "omnibot")).toBe("ext-2");
    });
  });
});
