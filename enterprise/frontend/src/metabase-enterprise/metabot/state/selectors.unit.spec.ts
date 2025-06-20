import { setupEnterprisePlugins } from "__support__/enterprise";
import { uuid } from "metabase/lib/uuid";
import { createMockState } from "metabase-types/store/mocks";

import type { MetabotState } from "./reducer";
import { getLastAgentMessagesByType } from "./selectors";

describe("metabot selectors", () => {
  describe("getLastAgentMessagesByType", () => {
    function setup(messages: MetabotState["messages"]) {
      setupEnterprisePlugins();

      // NOTE: importing default initial state from ./reducer
      // breaks the tests for some reason
      const metabotPlugin: MetabotState = {
        useStreaming: false,
        isProcessing: false,
        messages,
        state: {},
        history: [],
        visible: true,
        conversationId: uuid(),
        activeToolCall: undefined,
      };

      return createMockState({ plugins: { metabotPlugin } } as any);
    }

    it("should not return any messages if there are none", () => {
      const state = setup([]);
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual([]);
    });

    it("should not return any messages if latest message is from a user", () => {
      const state = setup([{ id: "1", role: "user", message: "bleh" }]);
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual([]);
    });

    it("should return latest agent reply messages only", () => {
      const state = setup([
        { id: "1", role: "user", message: "bleh" },
        { id: "2", role: "agent", type: "reply", message: "blah" },
        { id: "3", role: "agent", type: "reply", message: "blah" },
      ]);
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual(["blah", "blah"]);
    });

    it("should return latest agent error messages only", () => {
      const state = setup([
        { id: "1", role: "agent", type: "reply", message: "blah" },
        { id: "2", role: "agent", type: "error", message: "BLAH" },
        { id: "3", role: "agent", type: "error", message: "BLAH" },
      ]);
      const messages = getLastAgentMessagesByType(state as any);
      expect(messages).toEqual(["BLAH", "BLAH"]);
    });
  });
});
