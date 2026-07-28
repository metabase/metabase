import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { isUuid } from "metabase/utils/uuid";

import {
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  erroredResponse,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  stopResponseButton,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > threading", () => {
  it("should omit parent_message_id for the very first message of a new conversation", async () => {
    setup();

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Who is your favorite?");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBeUndefined();
  });

  it("should mint uuid user_message_id and assistant_message_id on every request", async () => {
    setup();

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Who is your favorite?");
    const reqBody = await lastReqBody(agentSpy);
    expect(isUuid(reqBody?.user_message_id)).toBe(true);
    expect(isUuid(reqBody?.assistant_message_id)).toBe(true);
  });

  it("should send the minted assistant id as parent_message_id when aborted before the start event", async () => {
    setup();

    const [pause] = createPauses(1);
    const firstSpy = mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield* [];
          await pause.promise;
        })(),
      ),
    });
    await enterChatMessage("Who is your favorite?");
    await userEvent.click(await stopResponseButton());
    pause.resolve();
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-stop-response"),
      ).not.toBeInTheDocument();
    });
    const firstReqBody = await lastReqBody(firstSpy);

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Nevermind, hi!");
    const reqBody = await lastReqBody(agentSpy);
    expect(isUuid(firstReqBody?.assistant_message_id)).toBe(true);
    expect(reqBody?.parent_message_id).toBe(firstReqBody?.assistant_message_id);
  });

  it("should send parent_message_id matching the previous turn's external id", async () => {
    setup();

    const first = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });
    await enterChatMessage("Who is your favorite?");
    first.sendResponse();
    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();

    const second = mockAgentEndpoint({
      events: [
        { type: "start", messageId: "msg_second_turn" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Sure." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop" },
      ],
      waitForResponse: true,
    });
    await enterChatMessage("Are you sure?");
    second.sendResponse();
    expect(await screen.findByText("Sure.")).toBeInTheDocument();

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Hi again!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBe("msg_second_turn");
  });

  it("should send the aborted turn's message id as parent_message_id on the next message", async () => {
    setup();

    const [pause] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "start", messageId: "msg_aborted_turn" };
          yield { type: "text-start", id: "t1" };
          yield { type: "text-delta", id: "t1", delta: "Let me think" };
          await pause.promise;
        })(),
      ),
    });
    await enterChatMessage("Who is your favorite?");
    await userEvent.click(await stopResponseButton());
    pause.resolve();
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-stop-response"),
      ).not.toBeInTheDocument();
    });

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Nevermind, hi!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBe("msg_aborted_turn");
  });

  it("should thread onto the prior successful turn after an errored turn is rewound", async () => {
    setup();

    // a first successful turn establishes the pointer to fall back to
    mockAgentEndpoint({
      events: [
        { type: "start", messageId: "msg_good_turn" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "First answer." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop" },
      ],
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("First answer.")).toBeInTheDocument();

    // a second turn fails at the stream level
    mockAgentEndpoint({ events: erroredResponse });
    await enterChatMessage("second prompt");
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();

    // the next submit rewinds the errored turn, so the pointer lands back on
    // the good turn rather than being cleared
    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("third prompt");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBe("msg_good_turn");
  });
});
