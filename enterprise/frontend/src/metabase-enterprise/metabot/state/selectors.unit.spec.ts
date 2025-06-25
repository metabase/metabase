import { setupEnterprisePlugins } from "__support__/enterprise";
import { uuid } from "metabase/lib/uuid";
import { createMockState } from "metabase-types/store/mocks";

import type { MetabotState } from "./reducer";
import {
  getLastAgentMessagesByType,
  getUserPromptForMessageId,
} from "./selectors";

function setup(metabotState: Partial<MetabotState>) {
  setupEnterprisePlugins();

  // NOTE: importing default initial state from ./reducer
  // breaks the tests for some reason
  const metabotPlugin: MetabotState = Object.assign(
    {
      useStreaming: false,
      isProcessing: false,
      messages: [],
      state: {},
      history: [],
      visible: true,
      conversationId: uuid(),
      activeToolCall: undefined,
    },
    metabotState,
  );

  return createMockState({ plugins: { metabotPlugin } } as any);
}

describe("metabot selectors", () => {
  describe("getLastAgentMessagesByType", () => {
    it("should not return any messages if there are none", () => {
      const state = setup({ messages: [] });
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual([]);
    });

    it("should not return any messages if latest message is from a user", () => {
      const state = setup({
        messages: [{ id: "1", role: "user", message: "bleh" }],
      });
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual([]);
    });

    it("should return latest agent reply messages only", () => {
      const state = setup({
        messages: [
          { id: "1", role: "user", message: "bleh" },
          { id: "2", role: "agent", type: "reply", message: "blah" },
          { id: "3", role: "agent", type: "reply", message: "blah" },
        ],
      });
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual(["blah", "blah"]);
    });

    it("should return latest agent error messages only", () => {
      const state = setup({
        messages: [
          { id: "1", role: "agent", type: "reply", message: "blah" },
          { id: "2", role: "agent", type: "error", message: "BLAH" },
          { id: "3", role: "agent", type: "error", message: "BLAH" },
        ],
      });
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual(["BLAH", "BLAH"]);
    });
  });

  describe("getUserPromptForMessageId", () => {
    it("should return the message with the matching id if id is for a user message", () => {
      const state = setup({
        messages: [
          { id: "1", role: "user", message: "bleh" },
          { id: "2", role: "agent", type: "reply", message: "blah" },
        ],
      });
      const message = getUserPromptForMessageId(state as any, "1");
      expect(message).toEqual({ id: "1", role: "user", message: "bleh" });
    });

    it("should return the message with the matching id if id is for an agent message", () => {
      const state = setup({
        messages: [
          { id: "1", role: "user", message: "bleh" },
          { id: "2", role: "agent", type: "reply", message: "blah" },
          { id: "3", role: "user", message: "bleh bleh" },
          { id: "4", role: "agent", type: "reply", message: "blah blah" },
        ],
      });
      const message1 = getUserPromptForMessageId(state as any, "2");
      expect(message1).toEqual({ id: "1", role: "user", message: "bleh" });
      const message2 = getUserPromptForMessageId(state as any, "4");
      expect(message2).toEqual({ id: "3", role: "user", message: "bleh bleh" });
    });
  });
});
