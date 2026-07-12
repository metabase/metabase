import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { isRejected } from "@reduxjs/toolkit";

import { act } from "__support__/ui";
import type { State } from "metabase/redux/store";

import { getIsProcessing, sendAgentRequest } from "../state";

import {
  createMockReadableStream,
  createPauses,
  mockAgentEndpoint,
  setup,
} from "./utils";

type TestDispatch = ThunkDispatch<State, void, UnknownAction>;

const getTestDispatch = (store: ReturnType<typeof setup>["store"]) =>
  store.dispatch as TestDispatch;

describe("metabot actions", () => {
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
