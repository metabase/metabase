/* eslint-disable jest/expect-expect */
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, waitFor, within } from "__support__/ui";
import { LONG_CONVO_MSG_LENGTH_THRESHOLD } from "metabase/metabot/constants";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { metabotActions } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { logout } from "metabase/redux/auth";
import * as domModule from "metabase/utils/dom";
import { createMockUser } from "metabase-types/api/mocks";

import { Metabot } from "../components/Metabot";
import { MetabotChat } from "../components/MetabotChat";

import {
  assertNotVisible,
  assertVisible,
  chat,
  closeChatButton,
  enterChatMessage,
  hideMetabot,
  input,
  mockAgentEndpoint,
  resetChatButton,
  setup,
  showMetabot,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > ui", () => {
  it("should be able to render metabot", async () => {
    setup();
    await assertVisible();
  });

  it("does not render header actions unless they are provided", async () => {
    setup({
      ui: <MetabotChat config={{ agentId: "ask", suggestionModels: [] }} />,
    });

    expect(await screen.findByTestId("metabot-chat-input")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-reset-chat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metabot-close-chat")).not.toBeInTheDocument();
  });

  it("should show a setup prompt and disable chat input when metabot is not configured", async () => {
    setup({
      currentUser: createMockUser({ is_superuser: true }),
      isConfigured: false,
    });

    expect(
      await screen.findByText("To use Metabot, please", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should ask non-admins to contact an admin when metabot is not configured", async () => {
    setup({ isConfigured: false });

    expect(
      await screen.findByText(
        "Ask your admin to connect to a model to use Metabot.",
      ),
    ).toBeInTheDocument();
  });

  it("should show empty state ui if conversation is empty", async () => {
    setup();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    expect(
      await screen.findByTestId("metabot-empty-chat-info"),
    ).toBeInTheDocument();

    await enterChatMessage("Who is your favorite?");
    expect(
      await screen.findByText("Who is your favorite?"),
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("metabot-empty-chat-info"),
    ).not.toBeInTheDocument();
  });

  it("should be able to toggle visibility", async () => {
    const { store } = setup();
    expect(await chat()).toBeInTheDocument();
    await assertVisible();

    hideMetabot(store.dispatch);
    await assertNotVisible();

    showMetabot(store.dispatch);
    expect(await chat()).toBeInTheDocument();

    await userEvent.click(await closeChatButton());
    await assertNotVisible();
  });

  it("should be able to hide metabot via a prop", async () => {
    const { rerender } = setup();
    await assertVisible();

    rerender(<Metabot hide={true} />);
    await assertNotVisible();
  });

  it("should hide metabot when the user logs out", async () => {
    jest.spyOn(domModule, "reload").mockImplementation(() => {});

    try {
      const { store } = setup();
      fetchMock.delete(`path:/api/session`, 200);

      await assertVisible();
      act(() => {
        // Unjustified type cast. FIXME
        store.dispatch(logout(undefined) as any);
      });
      await assertNotVisible();
    } finally {
      // Unjustified type cast. FIXME
      (domModule.reload as any).mockRestore();
    }
  });

  it("should not show metabot if the user is not signed in", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message) => {
        if (
          message ===
          "Metabot can not be opened while there is no signed in user"
        ) {
          return;
        }
        console.error(message);
      });

    try {
      const { store } = setup({
        metabotInitialState: getMetabotInitialState(),
        currentUser: null,
      });
      await assertNotVisible();
      showMetabot(store.dispatch);
      await assertNotVisible();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("should render markdown for messages", async () => {
    setup();
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        {
          type: "text-delta",
          id: "t1",
          delta: "# You, but don't tell anyone.",
        },
        { type: "text-end", id: "t1" },
        { type: "data-state", data: { queries: {} } },
        { type: "finish", finishReason: "stop" },
      ],
    });

    await enterChatMessage("# Who is your favorite?");

    await screen.findByRole("heading", {
      level: 1,
      name: `Who is your favorite?`,
    });
    await screen.findByRole("heading", {
      level: 1,
      name: `You, but don't tell anyone.`,
    });
  });

  it("should render single newlines in user input as separate paragraphs", async () => {
    const { store } = setup();

    store.dispatch(
      metabotActions.addUserMessage({
        agentId: "omnibot",
        id: "user-1",
        type: "text",
        message: "first line\nsecond line",
      }),
    );

    const messages = await screen.findAllByTestId("metabot-chat-message");
    const userMessage = messages[0];
    const firstParagraph = within(userMessage).getByText("first line", {
      selector: "p",
    });
    const secondParagraph = within(userMessage).getByText("second line", {
      selector: "p",
    });

    expect(firstParagraph).toBeInTheDocument();
    expect(secondParagraph).toBeInTheDocument();
  });

  it("should preserve double newlines from user input", async () => {
    const { store } = setup();

    store.dispatch(
      metabotActions.addUserMessage({
        agentId: "omnibot",
        id: "user-2",
        type: "text",
        message: "first line\n\nsecond line",
      }),
    );

    const messages = await screen.findAllByTestId("metabot-chat-message");
    const userMessage = messages[0];
    const firstParagraph = within(userMessage).getByText("first line", {
      selector: "p",
    });
    const secondParagraph = within(userMessage).getByText("second line", {
      selector: "p",
    });

    expect(firstParagraph).toBeInTheDocument();
    expect(secondParagraph).toBeInTheDocument();
  });

  it("should warn the chat is getting long w/ ability to clear it", async () => {
    const { store } = setup();
    const longMsg = "x".repeat(LONG_CONVO_MSG_LENGTH_THRESHOLD / 2);

    act(() => {
      store.dispatch(
        metabotActions.addUserMessage({
          id: "1",
          type: "text",
          message: longMsg,
          agentId: "omnibot",
        }),
      );
    });
    expect(await screen.findByText(/xxxxxxx/)).toBeInTheDocument();
    expect(
      screen.queryByText(/This chat is getting long/),
    ).not.toBeInTheDocument();

    act(() => {
      store.dispatch(
        metabotActions.addUserMessage({
          id: "2",
          type: "text",
          message: longMsg,
          agentId: "omnibot",
        }),
      );
    });
    expect(
      await screen.findByText(/This chat is getting long/),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("metabot-reset-long-chat"));

    await waitFor(() => {
      expect(
        screen.queryByText(/This chat is getting long/),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/xxxxxxx/)).not.toBeInTheDocument();
  });

  it("should be able to set the prompt input's value from anywhere in the app", async () => {
    const AnotherComponent = () => {
      const { setPrompt } = useMetabotAgent("omnibot");

      return <button onClick={() => setPrompt("TEST VAL")}>CLICK HERE</button>;
    };

    setup({
      ui: (
        <div>
          <AnotherComponent />
          <Metabot />
        </div>
      ),
    });

    expect(await input()).toHaveTextContent("");
    await userEvent.click(await screen.findByText("CLICK HERE"));
    expect(await input()).toHaveTextContent("TEST VAL");
  });

  describe("prompt-suggestions", () => {
    it("should provide prompt suggestions if available", async () => {
      const prompts = [
        {
          id: 1,
          metabot_id: 1,
          prompt: "What is the total revenue for this quarter?",
          model: "metric" as const,
          model_id: 1,
          model_name: "Quarterly Revenue Calculator",
          created_at: "2025-05-15T10:30:00Z",
          updated_at: "2025-05-15T10:30:00Z",
        },
        {
          id: 2,
          metabot_id: 1,
          prompt:
            "Show me the customer acquisition trends over the last 6 months",
          model: "model" as const,
          model_id: 2,
          model_name: "Customer Acquisition Trend Analyzer",
          created_at: "2025-05-15T11:15:00Z",
          updated_at: "2025-05-15T11:15:00Z",
        },
        {
          id: 3,
          metabot_id: 1,
          prompt: "What are our top performing products by sales volume?",
          model: "metric" as const,
          model_id: 3,
          model_name: "Product Performance Ranking",
          created_at: "2025-05-15T14:22:00Z",
          updated_at: "2025-05-16T09:45:00Z",
        },
      ];
      setup({ promptSuggestions: prompts });
      const agentSpy = mockAgentEndpoint({
        events: whoIsYourFavoriteResponse,
      });

      expect(
        await screen.findByTestId("metabot-prompt-suggestions"),
      ).toBeInTheDocument();
      expect(await screen.findByText(prompts[0].prompt)).toBeInTheDocument();
      const prompt1 = await screen.findByText(prompts[1].prompt);
      expect(prompt1).toBeInTheDocument();

      await userEvent.click(prompt1);
      await waitFor(async () => {
        expect(agentSpy).toHaveBeenCalledTimes(1);
      });

      expect(await screen.findByText(prompts[1].prompt)).toBeInTheDocument();
      expect(screen.queryByText(prompts[0].prompt)).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("metabot-prompt-suggestions"),
      ).not.toBeInTheDocument();
    });

    it("should make a request for new suggested prompts when the conversation is reset", async () => {
      setup({ promptSuggestions: [] });
      await waitFor(async () => {
        expect(
          fetchMock.callHistory.calls(
            `path:/api/metabot/metabot/1/prompt-suggestions`,
          ),
        ).toHaveLength(1);
      });

      await userEvent.click(await resetChatButton());

      await waitFor(async () => {
        expect(
          fetchMock.callHistory.calls(
            `path:/api/metabot/metabot/1/prompt-suggestions`,
          ),
        ).toHaveLength(2);
      });
    });
  });
});
