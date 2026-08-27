import type { FetchedChatMessage } from "./normalize-fetched-chat-messages";
import { normalizeFetchedChatMessages } from "./normalize-fetched-chat-messages";

const agentText = (
  id: string,
  message: string,
  extras: {
    finished?: boolean | null;
    error?: { message: string } | null;
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
    it("converts slack mrkdwn to markdown when isSlack is true", () => {
      const result = normalizeFetchedChatMessages(
        [
          agentText("a1", "see <https://example.com|the docs>", {
            finished: true,
          }),
        ],
        { isSlack: true },
      );
      expect(result[0]).toMatchObject({
        type: "text",
        message: "see [the docs](https://example.com)",
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
