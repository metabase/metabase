import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { isRejected } from "@reduxjs/toolkit";

import { act } from "__support__/ui";
import type { State } from "metabase/redux/store";

import { METABOT_ERR_MSG } from "../constants";
import {
  getIsProcessing,
  getMessages,
  sendAgentRequest,
  submitInput,
} from "../state";

import {
  createMockReadableStream,
  createPauses,
  mockAgentEndpoint,
  setup,
} from "./utils";

const disabledPart = "state" as const;

type TestDispatch = ThunkDispatch<State, void, UnknownAction>;

const getTestDispatch = (store: ReturnType<typeof setup>["store"]) =>
  store.dispatch as TestDispatch;

describe("metabot actions", () => {
  it("should reject sendAgentRequest when a disabled data part is received", async () => {
    const { store } = setup();
    const dispatch = getTestDispatch(store);

    const agentSpy = mockAgentEndpoint({
      textChunks: [
        `0:"Allowed response"`,
        `2:{"type":"state","version":1,"value":{}}`,
        `0:"unreachable text"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}`,
      ],
    });

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const request: Parameters<typeof sendAgentRequest>[0] = {
      agentId: "omnibot",
      message: "Hello world",
      context: {
        current_time_with_timezone: "",
        user_is_viewing: [],
        capabilities: [],
        disabled_data_parts: [disabledPart],
      },
      history: [],
      state: {},
      conversation_id: store.getState().metabot.conversations.omnibot
        ?.conversationId as string,
    };

    const result = await act(async () => {
      return dispatch(sendAgentRequest(request));
    });

    expect(isRejected(result)).toBe(true);
    expect(agentSpy).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      type: "error",
      shouldRetry: true,
      display: {
        type: "message",
        message: METABOT_ERR_MSG.default,
      },
    });

    expect(getIsProcessing(store.getState(), "omnibot")).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("should mark submitInput as failed and stop processing after a disabled part", async () => {
    const { store } = setup();
    const dispatch = getTestDispatch(store);

    mockAgentEndpoint({
      textChunks: [
        `0:"Allowed response"`,
        `2:{"type":"state","version":1,"value":{"queries":{}}}`,
        `0:"This text should not be emitted"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}`,
      ],
    });

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const input: Parameters<typeof submitInput>[0] = {
      agentId: "omnibot",
      type: "text",
      message: "What is blocked?",
      context: {
        current_time_with_timezone: "",
        user_is_viewing: [],
        capabilities: [],
        disabled_data_parts: [disabledPart],
      },
    };

    const result = await act(async () => {
      return dispatch(submitInput(input));
    });

    expect(result.payload).toMatchObject({
      prompt: "What is blocked?",
      success: false,
      shouldRetry: true,
    });

    expect(getIsProcessing(store.getState(), "omnibot")).toBe(false);

    const messages = getMessages(store.getState(), "omnibot");
    expect(messages).toHaveLength(3);
    expect(messages.at(1)).toMatchObject({
      role: "agent",
      type: "text",
      message: "Allowed response",
    });
    expect(messages.at(2)).toMatchObject({
      role: "agent",
      type: "turn_errored",
      display: {
        type: "message",
        message: METABOT_ERR_MSG.default,
      },
    });

    expect(messages.at(0)).toMatchObject({
      role: "user",
      type: "text",
      message: "What is blocked?",
    });

    consoleErrorSpy.mockRestore();
  });

  it("should allow request cancellation and mark sendAgentRequest as aborted", async () => {
    const { store } = setup();
    const dispatch = getTestDispatch(store);

    const [readGate] = createPauses(1);
    const stream = createMockReadableStream(
      (async function* () {
        await readGate;
        yield `0:"Never seen"`;
      })(),
    );

    const request: Parameters<typeof sendAgentRequest>[0] = {
      agentId: "omnibot",
      message: "Abort me",
      context: {
        current_time_with_timezone: "",
        user_is_viewing: [],
        capabilities: [],
      },
      history: [],
      state: {},
      conversation_id: store.getState().metabot.conversations.omnibot
        ?.conversationId as string,
    };
    mockAgentEndpoint({ stream });

    const result = await act(async () => {
      const sendPromise = dispatch(sendAgentRequest(request));
      sendPromise.abort();
      return sendPromise;
    });

    const rejectedResult = result as {
      meta: { aborted: boolean };
      error: { name: string };
      payload?: never;
    };

    expect(isRejected(rejectedResult)).toBe(true);
    expect(rejectedResult.meta).toMatchObject({
      aborted: true,
    });
    expect(rejectedResult.error).toMatchObject({
      name: "AbortError",
    });
    expect(rejectedResult.payload).toBeUndefined();

    expect(getIsProcessing(store.getState(), "omnibot")).toBe(false);
    readGate.resolve();
  });
});
