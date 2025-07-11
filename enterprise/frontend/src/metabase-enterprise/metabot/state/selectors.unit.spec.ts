import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockState } from "metabase-types/store/mocks";

import {
  type MetabotState,
  getLastAgentMessagesByType,
  getMetabotInitialState,
  getUserPromptForMessageId,
} from "./index";

function setup(metabotState: Partial<MetabotState>) {
  setupEnterprisePlugins();

  return createMockState({
    plugins: {
      metabotPlugin: {
        ...getMetabotInitialState(),
        visible: true,
        ...metabotState,
      },
    },
  } as any);
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
          { id: "2", role: "agent", message: "blah" },
          { id: "3", role: "agent", message: "blah" },
        ],
      });
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual(["blah", "blah"]);
    });

    it("should return latest agent error messages only", () => {
      const state = setup({
        messages: [{ id: "1", role: "agent", message: "blah" }],
        errorMessages: [
          { type: "message", message: "BLAH" },
          { type: "message", message: "BLAH" },
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
          { id: "2", role: "agent", message: "blah" },
        ],
      });
      const message = getUserPromptForMessageId(state as any, "1");
      expect(message).toEqual({ id: "1", role: "user", message: "bleh" });
    });

    it("should return the message with the matching id if id is for an agent message", () => {
      const state = setup({
        messages: [
          { id: "1", role: "user", message: "bleh" },
          { id: "2", role: "agent", message: "blah" },
          { id: "3", role: "user", message: "bleh bleh" },
          { id: "4", role: "agent", message: "blah blah" },
        ],
      });
      const message1 = getUserPromptForMessageId(state as any, "2");
      expect(message1).toEqual({ id: "1", role: "user", message: "bleh" });
      const message2 = getUserPromptForMessageId(state as any, "4");
      expect(message2).toEqual({ id: "3", role: "user", message: "bleh bleh" });
    });
  });
});
