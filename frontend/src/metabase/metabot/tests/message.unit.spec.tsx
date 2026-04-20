import { screen } from "__support__/ui";

import {
  assertConversation,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  input,
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
      events: whoIsYourFavoriteResponse,
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
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");
    (await sendMessageButton()).click();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
  });

  it("should properly handle partial messages", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-start", id: "t1" };
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          yield { type: "text-end", id: "t1" };
          await pause1.promise;
          yield { type: "text-start", id: "t2" };
          yield { type: "text-delta", id: "t2", delta: "don't tell anyone." };
          yield { type: "text-end", id: "t2" };
          yield { type: "finish" };
          yield "[DONE]";
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
