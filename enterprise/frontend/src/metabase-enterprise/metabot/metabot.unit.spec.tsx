import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { logout } from "metabase/auth/actions";
import * as domModule from "metabase/lib/dom";
import { uuid } from "metabase/lib/uuid";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type { SuggestedMetabotPrompt, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "./components/Metabot";
import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
} from "./constants";
import { MetabotProvider } from "./context";
import {
  type MetabotState,
  addUserMessage,
  metabotInitialState,
  metabotReducer,
  setVisible,
} from "./state";

function setup(
  options: {
    ui?: React.ReactElement;
    metabotPluginInitialState?: MetabotState;
    currentUser?: User | null | undefined;
    promptSuggestions?: SuggestedMetabotPrompt[];
  } | void,
) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  setupEnterprisePlugins();

  const {
    ui = <Metabot />,
    currentUser = createMockUser(),
    metabotPluginInitialState = {
      ...metabotInitialState,
      conversationId: uuid(),
      visible: true,
    },
    promptSuggestions = [],
  } = options || {};

  fetchMock.get(
    `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: promptSuggestions, offset: 0, limit: 3, total: 3 },
  );

  return renderWithProviders(<MetabotProvider>{ui}</MetabotProvider>, {
    storeInitialState: createMockState({
      settings,
      currentUser: currentUser ? currentUser : undefined,
      plugins: {
        metabotPlugin: metabotPluginInitialState,
      },
    } as any),
    customReducers: {
      plugins: combineReducers({
        metabotPlugin: metabotReducer,
      }),
    },
  });
}

const chat = () => screen.findByTestId("metabot-chat");
const input = () => screen.findByTestId("metabot-chat-input");
const enterChatMessage = async (message: string, send = true) =>
  userEvent.type(await input(), `${message}${send ? "{Enter}" : ""}`);
const closeChatButton = () => screen.findByTestId("metabot-close-chat");
const resetChatButton = () => screen.findByTestId("metabot-reset-chat");
const responseLoader = () => screen.findByTestId("metabot-response-loader");

const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
const assertNotVisible = async () =>
  await waitFor(() => {
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
  });

// NOTE: for some reason the keyboard shortcuts won't work with tinykeys while testing, using redux for now...
const hideMetabot = (dispatch: any) => act(() => dispatch(setVisible(false)));
const showMetabot = (dispatch: any) => act(() => dispatch(setVisible(true)));

const getMetabotState = (store: any) => store.getState().plugins.metabotPlugin;

const lastReqBody = async () => {
  const lastCall = fetchMock.lastCall();
  const bodyStr = String(await lastCall?.[1]?.body) || "";
  return JSON.parse(bodyStr);
};

describe("metabot", () => {
  describe("ui", () => {
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
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

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
          store.dispatch(logout(undefined) as any);
        });
        await assertNotVisible();
      } finally {
        (domModule.reload as any).mockRestore();
      }
    });

    it("should not show metabot if the user is not signed in", async () => {
      // suppress expected console error
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
          metabotPluginInitialState: metabotInitialState,
          currentUser: null,
        });
        await assertNotVisible();
        showMetabot(store.dispatch);
        await assertNotVisible();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("should render markdown for metabot's replies", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/v2/agent`, {
        ...whoIsYourFavoriteResponse,
        reactions: [
          {
            type: "metabot.reaction/message",
            message: "# You are... but don't tell anyone!",
          },
        ],
      });
      await enterChatMessage("Who is your favorite?");

      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent(`You are... but don't tell anyone!`);
    });

    it("should not render markdown for user messages", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      const msg = "# Who is your favorite?";
      await enterChatMessage(msg);
      expect(await screen.findByText(msg)).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
    });

    it("should provide prompt suggestions if avaiable", async () => {
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
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      // should render prompts
      expect(
        await screen.findByTestId("metabot-prompt-suggestions"),
      ).toBeInTheDocument();
      expect(await screen.findByText(prompts[0].prompt)).toBeInTheDocument();
      const prompt1 = await screen.findByText(prompts[1].prompt);
      expect(prompt1).toBeInTheDocument();

      // user should be able to click prompts to start a new convo
      await userEvent.click(prompt1);
      await waitFor(async () => {
        expect(
          fetchMock.calls(`path:/api/ee/metabot-v3/v2/agent`),
        ).toHaveLength(1);
      });

      // unclicked prompts should be gone, but clicked prompt should be in convo
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
          fetchMock.calls(
            `path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`,
          ),
        ).toHaveLength(1);
      });

      await userEvent.click(await resetChatButton());

      await waitFor(async () => {
        expect(
          fetchMock.calls(
            `path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`,
          ),
        ).toHaveLength(2);
      });
    });
  });

  describe("message", () => {
    it("should properly send chat messages", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
        { delay: 50 }, // small delay to cause loading state
      );

      await enterChatMessage("Who is your favorite?", false);
      expect(await input()).toHaveValue("Who is your favorite?");

      await enterChatMessage("Who is your favorite?");
      expect(await responseLoader()).toBeInTheDocument();
      expect(
        await screen.findByText("You are... but don't tell anyone!"),
      ).toBeInTheDocument();

      // should auto-clear input + refocus
      expect(await input()).toHaveValue("");
      expect(await input()).toHaveFocus();
    });
  });

  describe("context", () => {
    it("should send along default context", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      await enterChatMessage("Who is your favorite?");

      expect(
        isMatching(
          { current_time_with_timezone: P.string },
          (await lastReqBody())?.context,
        ),
      ).toEqual(true);
    });

    it("should allow components to register additional context", async () => {
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      const TestComponent = () => {
        useRegisterMetabotContextProvider(
          () =>
            Promise.resolve({
              user_is_viewing: [{ type: "dashboard", id: 1 }],
            }),
          [],
        );
        return null;
      };

      setup({
        ui: (
          <>
            <Metabot />
            <TestComponent />
          </>
        ),
      });

      await enterChatMessage("Who is your favorite?");

      expect(
        isMatching(
          {
            current_time_with_timezone: P.string,
            user_is_viewing: [{ type: "dashboard", id: 1 }],
          },
          (await lastReqBody())?.context,
        ),
      ).toBe(true);
    });
  });

  describe("history", () => {
    it("should send history from last response along with next message", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() =>
        expect(
          fetchMock.calls(`path:/api/ee/metabot-v3/v2/agent`),
        ).toHaveLength(1),
      );

      // send another message and check that there is proper history
      await enterChatMessage("Hi!");
      const lastCall = fetchMock.lastCall();
      const bodyStr = String(await lastCall?.[1]?.body) || "";
      const sentHistory = JSON.parse(bodyStr)?.history;
      expect(sentHistory).toEqual(whoIsYourFavoriteResponse.history);
    });

    it("should not clear history when metabot is hidden or opened", async () => {
      const { store } = setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() =>
        expect(
          fetchMock.calls(`path:/api/ee/metabot-v3/v2/agent`),
        ).toHaveLength(1),
      );

      // close, open, and then send another message and check that there is no history
      hideMetabot(store.dispatch);
      showMetabot(store.dispatch);
      await enterChatMessage("Hi!");
      const lastCall = fetchMock.lastCall();
      const bodyStr = String(await lastCall?.[1]?.body) || "";
      const sentHistory = JSON.parse(bodyStr)?.history;
      expect(sentHistory).toEqual(whoIsYourFavoriteResponse.history);
    });

    it("should clear history when the user hits the reset button", async () => {
      const { store } = setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/v2/agent`,
        whoIsYourFavoriteResponse,
      );

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() =>
        expect(
          fetchMock.calls(`path:/api/ee/metabot-v3/v2/agent`),
        ).toHaveLength(1),
      );

      const beforeResetState = getMetabotState(store);
      expect(beforeResetState.conversationId).not.toBe(null);
      expect(beforeResetState.messages).toStrictEqual([
        { actor: "user", message: "Who is your favorite?" },
        {
          actor: "agent",
          message: "You are... but don't tell anyone!",
          type: "reply",
        },
      ]);

      await userEvent.click(await resetChatButton());

      const afterResetState = getMetabotState(store);
      expect(afterResetState.conversationId).not.toBe(
        beforeResetState.conversationId,
      );
      expect(afterResetState.messages).toStrictEqual([]);
    });

    it("should warn the chat is getting long if the conversation is long w/ ability to clear history", async () => {
      const { store } = setup();
      const longMsg = "x".repeat(LONG_CONVO_MSG_LENGTH_THRESHOLD / 2);

      // adding messages this long via the ui's input makes the test hang
      act(() => {
        store.dispatch(addUserMessage(longMsg));
      });
      expect(await screen.findByText(/xxxxxxx/)).toBeInTheDocument();
      expect(
        screen.queryByText(/This chat is getting long/),
      ).not.toBeInTheDocument();

      act(() => {
        store.dispatch(addUserMessage(longMsg));
      });
      expect(
        await screen.findByText(/This chat is getting long/),
      ).toBeInTheDocument();
      await userEvent.click(
        await screen.findByTestId("metabot-reset-long-chat"),
      );

      await waitFor(() => {
        expect(
          screen.queryByText(/This chat is getting long/),
        ).not.toBeInTheDocument();
      });
      expect(screen.queryByText(/xxxxxxx/)).not.toBeInTheDocument();
    });
  });
});

const whoIsYourFavoriteResponse = {
  reactions: [
    {
      type: "metabot.reaction/message",
      message: "You are... but don't tell anyone!",
    },
  ],
  history: [
    {
      role: "user",
      content: "Who is your favorite?",
    },
    {
      content: "",
      role: "assistant",
      "tool-calls": [
        {
          id: "call_PVmnR8mcnYFF2AmqupSKzJDh",
          name: "who-is-your-favorite",
          arguments: {},
        },
      ],
    },
    {
      role: "tool",
      "tool-call-id": "call_PVmnR8mcnYFF2AmqupSKzJDh",
      content: "You are... but don't tell anyone!",
    },
    {
      content: "You are... but don't tell anyone!",
      role: "assistant",
    },
  ],
  state: {},
};
