/* eslint-disable jest/expect-expect */
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { logout } from "metabase/auth/actions";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { metabotActions } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import * as domModule from "metabase/utils/dom";

import { Metabot } from "../components/Metabot";

import {
  assertNotVisible,
  assertVisible,
  chat,
  closeChatButton,
  enterChatMessage,
  hideMetabot,
  input,
  lastChatMessage,
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

  it("should warn that metabot can be inaccurate", async () => {
    setup();
    expect(
      await screen.findByText("Metabot isn't perfect. Double-check results."),
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
      store.dispatch(logout(undefined) as any);
      await assertNotVisible();
    } finally {
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
        { type: "data-state", id: "d1", data: { queries: {} } },
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

  it("should present the user an option to retry a response", async () => {
    setup();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");
    const lastMessage = await lastChatMessage();
    expect(lastMessage).toHaveTextContent(/You, but don't tell anyone./);
    expect(
      await within(lastMessage!).findByTestId("metabot-chat-message-retry"),
    ).toBeInTheDocument();
  });

  it("should successfully rewind a response", async () => {
    setup();
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "Let me think..." },
        { type: "text-end", id: "t0" },
        ...whoIsYourFavoriteResponse,
      ],
    });
    await enterChatMessage("Who is your favorite?");

    const beforeMessages = await screen.findByTestId("metabot-chat-messages");
    expect(beforeMessages).toHaveTextContent(/Let me think.../);
    expect(beforeMessages).toHaveTextContent(/You, but don't tell anyone./);

    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "The answer is always you." },
        { type: "text-end", id: "t1" },
        { type: "data-state", id: "d1", data: { queries: {} } },
      ],
    });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const afterMessages = await screen.findByTestId("metabot-chat-messages");

    expect(afterMessages).not.toHaveTextContent(/Let me think.../);
    expect(afterMessages).not.toHaveTextContent(/You, but don't tell anyone./);

    expect(afterMessages).toHaveTextContent(/The answer is always you./);
  });

  it("should not show retry option for error messages", async () => {
    setup();

    mockAgentEndpoint({
      events: [
        { type: "error", errorText: "Anthropic API key expired or invalid" },
      ],
    });

    await enterChatMessage("Who is your favorite?");

    const lastMessage = await lastChatMessage();
    expect(lastMessage).toHaveTextContent(
      /Anthropic API key expired or invalid/,
    );
    expect(
      within(lastMessage!).queryByTestId("metabot-chat-message-retry"),
    ).not.toBeInTheDocument();
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
