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
  // The TipTap/ProseMirror prompt editor these tests drive processes input
  // through real timers/microtasks; the fast-test regime's frozen fake timers
  // prevent messages from ever being submitted. Opt this file back into real
  // timers.
  beforeEach(() => {
    jest.useRealTimers();
  });

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
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "don't tell anyone." };
          yield { type: "finish", finishReason: "stop" };
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
