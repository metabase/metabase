import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockState } from "metabase-types/store/mocks";

import {
  type MetabotState,
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
  describe("getUserPromptForMessageId", () => {
    it("should return the message with the matching id if id is for a user message", () => {
      const state = setup({
        messages: [
          { id: "1", role: "user", type: "text", message: "bleh" },
          { id: "2", role: "agent", type: "text", message: "blah" },
        ],
      });
      const message = getUserPromptForMessageId(state as any, "1");
      expect(message).toEqual({
        id: "1",
        role: "user",
        type: "text",
        message: "bleh",
      });
    });

    it("should return the message with the matching id if id is for an agent message", () => {
      const state = setup({
        messages: [
          { id: "1", type: "text", role: "user", message: "bleh" },
          { id: "2", type: "text", role: "agent", message: "blah" },
          { id: "3", type: "text", role: "user", message: "bleh bleh" },
          { id: "4", type: "text", role: "agent", message: "blah blah" },
        ],
      });
      const message1 = getUserPromptForMessageId(state as any, "2");
      expect(message1).toEqual({ id: "1", role: "user", message: "bleh" });
      const message2 = getUserPromptForMessageId(state as any, "4");
      expect(message2).toEqual({
        id: "3",
        role: "user",
        type: "text",
        message: "bleh bleh",
      });
    });
  });
});
