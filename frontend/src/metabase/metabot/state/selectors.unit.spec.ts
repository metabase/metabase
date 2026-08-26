import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetabotMessage } from "__support__/server-mocks";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { CONTEXT_WINDOW_WARNING_PERCENT } from "../constants";

import { getMetabotInitialState } from "./reducer-utils";

import {
  type MetabotConversationState,
  type MetabotMessage,
  getContextUsagePercent,
  getIsConversationInProgress,
  getLastAgentMessageExternalId,
  getLongChatNotice,
  getUserPromptMessage,
} from "./index";

function setup(
  messages: MetabotMessage[],
  convoState?: Partial<
    Pick<
      MetabotConversationState,
      "conversationId" | "lastTokenUsage" | "profileOverride"
    >
  >,
): State {
  setupEnterprisePlugins();

  const conversationId = convoState?.conversationId ?? "omnibot";
  const state = getMetabotInitialState();
  const visibleState = assocIn(state, ["agents", "omnibot", "visible"], true);
  const withMessages = assocIn(
    visibleState,
    ["conversations", conversationId, "messages"],
    messages,
  );
  const withConvoState = Object.entries(convoState ?? {}).reduce(
    (acc, [key, value]) =>
      assocIn(acc, ["conversations", conversationId, key], value),
    withMessages,
  );

  return createMockState({ metabot: withConvoState });
}

describe("metabot selectors", () => {
  describe("getUserPromptMessage", () => {
    it("returns the message itself when the id addresses a user message", () => {
      const state = setup([
        createMockMetabotMessage({
          role: "user",
          parts: [{ id: "1", role: "user", type: "text", message: "bleh" }],
        }),
        createMockMetabotMessage({
          parts: [{ id: "2", role: "agent", type: "text", message: "blah" }],
        }),
      ]);
      expect(getUserPromptMessage(state, "omnibot", "1")).toMatchObject({
        role: "user",
        parts: [{ id: "1", type: "text", message: "bleh" }],
      });
    });

    it("returns the preceding user message when the id addresses an agent message", () => {
      const state = setup([
        createMockMetabotMessage({
          role: "user",
          parts: [{ id: "1", role: "user", type: "text", message: "bleh" }],
        }),
        createMockMetabotMessage({
          parts: [{ id: "2", role: "agent", type: "text", message: "blah" }],
        }),
        createMockMetabotMessage({
          role: "user",
          parts: [
            { id: "3", role: "user", type: "text", message: "bleh bleh" },
          ],
        }),
        createMockMetabotMessage({
          parts: [
            { id: "4", role: "agent", type: "text", message: "blah blah" },
          ],
        }),
      ]);
      expect(getUserPromptMessage(state, "omnibot", "2")).toMatchObject({
        parts: [{ id: "1", message: "bleh" }],
      });
      expect(getUserPromptMessage(state, "omnibot", "4")).toMatchObject({
        parts: [{ id: "3", message: "bleh bleh" }],
      });
    });
  });

  describe("getLastAgentMessageExternalId", () => {
    it("returns the last agent message's id", () => {
      const state = setup([
        createMockMetabotMessage({
          role: "user",
          parts: [{ id: "1", role: "user", type: "text", message: "hi" }],
        }),
        createMockMetabotMessage({
          externalId: "ext-2",
          parts: [
            { id: "2", role: "agent", type: "text", message: "working on it" },
          ],
        }),
      ]);
      expect(getLastAgentMessageExternalId(state, "omnibot")).toBe("ext-2");
    });

    it("returns the id of a message made only of tool calls", () => {
      const state = setup([
        createMockMetabotMessage({
          role: "user",
          parts: [{ id: "1", role: "user", type: "text", message: "hi" }],
        }),
        createMockMetabotMessage({
          externalId: "ext-2",
          parts: [{ id: "2", role: "agent", type: "text", message: "on it" }],
        }),
        createMockMetabotMessage({
          role: "user",
          parts: [
            { id: "3", role: "user", type: "text", message: "top customers?" },
          ],
        }),
        // a clarification message renders nothing but a tool call — it still has
        // to anchor the next request's parent_message_id
        createMockMetabotMessage({
          externalId: "ext-4",
          parts: [
            {
              id: "call-1",
              role: "agent",
              type: "tool_call",
              name: "ask_for_sql_clarification",
              status: "ended",
            },
          ],
        }),
      ]);
      expect(getLastAgentMessageExternalId(state, "omnibot")).toBe("ext-4");
    });
  });

  describe("getLongChatNotice", () => {
    const shortMessage = createMockMetabotMessage({
      role: "user",
      parts: [{ id: "1", role: "user", type: "text", message: "hi" }],
    });
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

  describe("getIsConversationInProgress", () => {
    it("detects a mid-thread in-progress message for profiles like slackbot", () => {
      const conversationId = "slackbot";
      const state = setup(
        [
          createMockMetabotMessage({ status: { type: "in_progress" } }),
          createMockMetabotMessage({ status: { type: "done" } }),
        ],
        { conversationId, profileOverride: "slackbot" },
      );

      expect(getIsConversationInProgress(state, conversationId)).toBe(true);
    });
  });
});
