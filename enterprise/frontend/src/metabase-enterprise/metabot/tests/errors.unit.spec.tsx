import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { METABOT_ERR_MSG } from "metabase-enterprise/metabot/constants";

import {
  assertConversation,
  enterChatMessage,
  erroredResponse,
  input,
  mockAgentEndpoint,
  resetChatButton,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > errors", () => {
  it("should handle service error response", async () => {
    setup();
    fetchMock.post(`path:/api/ee/metabot-v3/native-agent-streaming`, 500);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.agentOffline],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should handle non-successful responses", async () => {
    setup();
    fetchMock.post(`path:/api/ee/metabot-v3/native-agent-streaming`, 400);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.default],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should handle show error if data error part is in response", async () => {
    setup();
    mockAgentEndpoint({ textChunks: erroredResponse });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.default],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should not show a user error when an AbortError is triggered", async () => {
    setup();
    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);

    await userEvent.click(await resetChatButton());

    await assertConversation([]);
    expect(await input()).toHaveTextContent("");
  });

  it("should remove previous error messages and prompt when submitting next prompt", async () => {
    setup();
    fetchMock.post(`path:/api/ee/metabot-v3/native-agent-streaming`, 500);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.agentOffline],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });
    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });
});
