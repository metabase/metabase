import type { FetchedChatMessage } from "./normalize-fetched-chat-messages";
import { normalizeFetchedChatMessages } from "./normalize-fetched-chat-messages";

const userText = (message: string): FetchedChatMessage => ({
  id: `u-${message}`,
  role: "user",
  type: "text",
  message,
});

const agentText = (
  id: string,
  message: string,
  extras: { finished?: boolean; error?: { message: string } | null } = {},
): FetchedChatMessage => ({
  id,
  role: "agent",
  type: "text",
  message,
  externalId: id,
  ...extras,
});

describe("normalizeFetchedChatMessages", () => {
  it("does not append a trailing turn message for finished agent messages", () => {
    const result = normalizeFetchedChatMessages([
      userText("hi"),
      agentText("a1", "hello", { finished: true }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "a1",
      role: "agent",
      type: "text",
      message: "hello",
    });
  });

  it("appends a turn_aborted after an aborted agent message", () => {
    const result = normalizeFetchedChatMessages([
      userText("hi"),
      agentText("a1", "partial", { finished: false }),
    ]);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({
      role: "agent",
      type: "turn_aborted",
      externalId: "a1",
    });
  });

  it("appends a turn_errored carrying the error payload", () => {
    const err = { message: "boom" };
    const result = normalizeFetchedChatMessages([
      userText("hi"),
      agentText("a1", "partial", { error: err }),
    ]);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({
      role: "agent",
      type: "turn_errored",
      error: err,
      externalId: "a1",
    });
  });

  it("prefers turn_errored over turn_aborted when both finished:false and error are set", () => {
    const err = { message: "boom" };
    const result = normalizeFetchedChatMessages([
      agentText("a1", "x", { finished: false, error: err }),
    ]);
    expect(result[result.length - 1]).toMatchObject({
      type: "turn_errored",
      error: err,
    });
  });

  it("leaves externalId unset on the trailing turn message when the source has none", () => {
    const toolCall: FetchedChatMessage = {
      id: "tc-1",
      role: "agent",
      type: "tool_call",
      name: "search",
      status: "ended",
      finished: false,
    };
    const result = normalizeFetchedChatMessages([toolCall]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      id: expect.any(String),
      role: "agent",
      type: "turn_aborted",
      externalId: undefined,
    });
  });
});
