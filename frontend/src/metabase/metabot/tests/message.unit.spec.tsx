import { act, screen } from "__support__/ui";
import { setModelOverride } from "metabase/metabot/state";

import {
  assertConversation,
  createMockReadableStream,
  createPauses,
  enterChatMessage,
  input,
  lastReqBody,
  mockAgentEndpoint,
  responseLoader,
  sendMessageButton,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > message", () => {
  it("should properly send chat messages", async () => {
    setup();

    const { sendResponse } = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    await enterChatMessage("Who is your favorite?");
    expect(await responseLoader()).toBeInTheDocument();

    sendResponse();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
    expect(await input()).toHaveTextContent("");
    expect(await input()).toHaveFocus();
  });

  it("should be able to send a message via send button", async () => {
    setup();
    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");
    (await sendMessageButton()).click();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
  });

  it("should send the selected model override with chat messages", async () => {
    const { store } = setup();
    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    act(() => {
      store.dispatch(
        setModelOverride({
          agentId: "omnibot",
          model: "anthropic/claude-opus-4-1",
        }),
      );
    });

    await enterChatMessage("Who is your favorite?");

    expect((await lastReqBody(agentSpy)).model).toBe(
      "anthropic/claude-opus-4-1",
    );
  });

  it("should omit the model parameter when the model override is undefined", async () => {
    const { store } = setup();
    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    act(() => {
      store.dispatch(
        setModelOverride({
          agentId: "omnibot",
          model: "anthropic/claude-opus-4-1",
        }),
      );
      store.dispatch(
        setModelOverride({ agentId: "omnibot", model: undefined }),
      );
    });

    await enterChatMessage("Who is your favorite?");

    expect(await lastReqBody(agentSpy)).not.toHaveProperty("model");
  });

  it("should properly handle partial messages", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockReadableStream(
        (async function* () {
          yield `0:"You, but "\n`;
          await pause1.promise;
          yield `0:"don't tell anyone."\n`;
          yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
    ]);

    pause1.resolve();

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });
});
