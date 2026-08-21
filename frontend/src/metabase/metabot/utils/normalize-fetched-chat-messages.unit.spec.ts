import type { FetchedChatMessage } from "./normalize-fetched-chat-messages";
import { normalizeFetchedChatMessages } from "./normalize-fetched-chat-messages";

const agentText = (
  id: string,
  message: string,
  extras: {
    finished?: boolean | null;
    error?: { message: string } | null;
    profile_id?: string | null;
  } = {},
): FetchedChatMessage => ({
  id,
  role: "agent",
  type: "text",
  message,
  externalId: id,
  ...extras,
});

describe("normalizeFetchedChatMessages", () => {
  describe("slack", () => {
    it("converts slack mrkdwn to markdown for a slack-authored message", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "see <https://example.com|the docs>", {
          finished: true,
          profile_id: "slackbot",
        }),
      ]);
      expect(result[0]).toMatchObject({
        type: "text",
        message: "see [the docs](https://example.com)",
      });
    });

    it("leaves a web-authored message unconverted", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "see <https://example.com|the docs>", {
          finished: true,
          profile_id: "embedding_next",
        }),
      ]);
      expect(result[0]).toMatchObject({
        type: "text",
        message: "see <https://example.com|the docs>",
      });
    });

    // The decision is per message: a conversation forked out of Slack and
    // continued on the web holds both, and converting by conversation would
    // corrupt whichever half lost the vote.
    it("converts only the slack-authored messages of a mixed conversation", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "see <https://example.com|the docs>", {
          finished: true,
          profile_id: "slackbot",
        }),
        agentText("a2", "see <https://example.com|the docs>", {
          finished: true,
          profile_id: "embedding_next",
        }),
      ]);
      expect(result[0]).toMatchObject({
        message: "see [the docs](https://example.com)",
      });
      expect(result[1]).toMatchObject({
        message: "see <https://example.com|the docs>",
      });
    });
  });

  describe("message states", () => {
    it("appends a turn_aborted after an aborted agent message", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "partial", { finished: false }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        role: "agent",
        type: "turn_aborted",
        externalId: "a1",
      });
    });

    it("appends a turn_errored carrying the error payload", () => {
      const err = { message: "boom" };
      const result = normalizeFetchedChatMessages([
        agentText("a1", "partial", { error: err }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        role: "agent",
        type: "turn_errored",
        error: err,
        externalId: "a1",
      });
    });

    it("does not append a trailing turn message finished agent messages w/o error", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "hello", { finished: true }),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "a1",
        role: "agent",
        type: "text",
        message: "hello",
      });
    });

    it("treats finished=null as not-aborted (no trailing turn_aborted)", () => {
      const result = normalizeFetchedChatMessages([
        agentText("a1", "hello", { finished: null }),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ type: "text", message: "hello" });
    });
  });
});
