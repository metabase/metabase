import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { fireEvent, screen, waitFor } from "__support__/ui";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";

import {
  createTestMetabotState,
  enterChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  testConversationId,
  whoIsYourFavoriteResponse,
} from "../../tests/utils";

function setupChat({ supported = true } = {}) {
  window.localStorage.clear();
  return setup({
    ui: <MetabotChat conversationId={testConversationId("omnibot")} />,
    metabotInitialState: createTestMetabotState(),
    storeInitialState: {
      settings: mockSettings({
        "llm-metabot-configured?": true,
        "llm-metabot-supports-reasoning-effort?": supported,
      }),
    },
  });
}

const trigger = () => screen.getByRole("button", { name: "Thinking effort" });

describe("MetabotReasoningEffort", () => {
  it("is hidden when the selected model does not support reasoning effort", () => {
    setupChat({ supported: false });
    expect(
      screen.queryByRole("button", { name: "Thinking effort" }),
    ).not.toBeInTheDocument();
  });

  it("omits reasoning_effort until the user picks a level", async () => {
    setupChat();
    const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    expect(trigger()).toHaveTextContent("Medium");

    await enterChatMessage("Count birds");

    expect(await lastReqBody(agent)).not.toHaveProperty("reasoning_effort");
  });

  it("sends the chosen level with each message and shows it on the trigger", async () => {
    setupChat();
    const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await userEvent.click(trigger());
    const slider = await screen.findByRole("slider", {
      name: "Thinking effort",
    });
    expect(trigger()).toHaveTextContent("Thinking level");
    expect(screen.getByTestId("reasoning-effort-title")).toHaveTextContent(
      "Medium",
    );

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    await waitFor(() => {
      expect(screen.getByTestId("reasoning-effort-title")).toHaveTextContent(
        "Extra High",
      );
    });
    expect(window.localStorage.getItem("metabot-reasoning-effort")).toBe(
      "xhigh",
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(trigger()).toHaveTextContent("Extra High");
    });
    await enterChatMessage("Count birds");

    expect(await lastReqBody(agent)).toMatchObject({
      message: "Count birds",
      reasoning_effort: "xhigh",
    });
  });
});
