import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { CONTEXT_WINDOW_WARNING_PERCENT } from "../constants";

import { getMetabotInitialState } from "./reducer-utils";

import {
  type MetabotChatMessage,
  type MetabotConversationState,
  getContextUsagePercent,
  getLastAgentMessageExternalId,
  getLongChatNotice,
  getUserPromptForMessageId,
} from "./index";

function setup(
  messages: MetabotChatMessage[],
  convoState?: Partial<Pick<MetabotConversationState, "lastTokenUsage">>,
): State {
  setupEnterprisePlugins();

  const state = getMetabotInitialState();
  const visibleState = assocIn(state, ["agents", "omnibot", "visible"], true);
  const withMessages = assocIn(
    visibleState,
    ["conversations", "omnibot", "messages"],
    messages,
  );
  const withConvoState = Object.entries(convoState ?? {}).reduce(
    (acc, [key, value]) =>
      assocIn(acc, ["conversations", "omnibot", key], value),
    withMessages,
  );

  return createMockState({ metabot: withConvoState });
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

  describe("getLongChatNotice", () => {
    const shortMessage: MetabotChatMessage = {
      id: "1",
      role: "user",
      type: "text",
      message: "hi",
    };
    const CONTEXT_WINDOW = 200000;
    const usage = (contextTokens: number) => ({
      lastTokenUsage: { contextTokens, contextWindowTokens: CONTEXT_WINDOW },
    });

    it("warns when context tokens reach the warning percent of the window", () => {
      const state = setup(
        [shortMessage],
        usage((CONTEXT_WINDOW * CONTEXT_WINDOW_WARNING_PERCENT) / 100),
      );
      expect(getLongChatNotice(state, "omnibot")).toBe("warning");
    });

    it("still only warns just short of the window — the whole window is usable", () => {
      const state = setup([shortMessage], usage(CONTEXT_WINDOW - 1));
      expect(getLongChatNotice(state, "omnibot")).toBe("warning");
    });

    it("reports full once context tokens consume the whole window", () => {
      const state = setup([shortMessage], usage(CONTEXT_WINDOW));
      expect(getLongChatNotice(state, "omnibot")).toBe("full");
    });

    it("shows nothing below the warning percent or when no usage has been observed", () => {
      expect(
        getLongChatNotice(setup([shortMessage], usage(10000)), "omnibot"),
      ).toBeUndefined();
      expect(
        getLongChatNotice(setup([shortMessage]), "omnibot"),
      ).toBeUndefined();
    });

    describe("getContextUsagePercent", () => {
      it("reports the last observed usage as a share of the window, 0-100", () => {
        const state = setup([shortMessage], usage(CONTEXT_WINDOW / 4));
        expect(getContextUsagePercent(state, "omnibot")).toBe(25);
      });

      it("reports 0 when no usage has been observed", () => {
        expect(getContextUsagePercent(setup([shortMessage]), "omnibot")).toBe(
          0,
        );
      });

      it("caps at 100 when the window is overrun", () => {
        const state = setup([shortMessage], usage(CONTEXT_WINDOW * 2));
        expect(getContextUsagePercent(state, "omnibot")).toBe(100);
      });
    });
  });
});
