/* eslint-disable jest/expect-expect */
import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";
import { P, isMatching } from "ts-pattern";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { logout } from "metabase/auth/actions";
import * as domModule from "metabase/lib/dom";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  createMockReadableStream,
  createPauses,
} from "metabase-enterprise/api/ai-streaming/test-utils";
import type { User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "./components/Metabot";
import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
  METABOT_ERR_MSG,
} from "./constants";
import { MetabotProvider } from "./context";
import { useMetabotAgent } from "./hooks";
import {
  type MetabotState,
  type MetabotStoreState,
  addSuggestedTransform,
  addUserMessage,
  getHistory,
  getMetabotConversation,
  getMetabotReactionsState,
  getMetabotRequestState,
  metabotReducer,
  setNavigateToPath,
} from "./state";
import { getMetabotInitialState } from "./state/reducer-utils";
import {
  assertConversation,
  assertNotVisible,
  assertVisible,
  chat,
  closeChatButton,
  enterChatMessage,
  hideMetabot,
  input,
  lastChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  resetChatButton,
  responseLoader,
  sendMessageButton,
  showMetabot,
  stopResponseButton,
} from "./tests/utils";

function setup(
  options: {
    ui?: React.ReactElement;
    metabotPluginInitialState?: MetabotState;
    currentUser?: User | null | undefined;
    promptSuggestions?: { prompt: string }[];
  } | void,
) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  setupEnterprisePlugins();

  const _metabotState = getMetabotInitialState();
  const metabotState = assocIn(
    _metabotState,
    ["conversations", "omnibot", "visible"],
    true,
  );

  const {
    ui = <Metabot />,
    currentUser = createMockUser(),
    metabotPluginInitialState = metabotState,
    promptSuggestions = [],
  } = options || {};

  fetchMock.get(
    `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: promptSuggestions, offset: 0, limit: 3, total: 3 },
  );
  setupDatabaseListEndpoint([]);

  const { store, rerender } = renderWithProviders(
    <MetabotProvider>{ui}</MetabotProvider>,
    {
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
    },
  );

  return {
    rerender,
    conversationIds: Object.keys(metabotState.conversations),
    store: store as Omit<typeof store, "getState"> & {
      getState: () => MetabotStoreState;
    },
  };
}

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
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

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
          metabotPluginInitialState: getMetabotInitialState(),
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
        textChunks: [
          `0:"# You, but don't tell anyone."`,
          `2:{"type":"state","version":1,"value":{"queries":{}}}`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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

    it("should present the user an option to provide feedback", async () => {
      const feedbackPath = "path:/api/ee/metabot-v3/feedback";

      setup();
      fetchMock.post(feedbackPath, 204);
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

      await enterChatMessage("Who is your favorite?");
      const lastMessage = await lastChatMessage();
      expect(lastMessage).toHaveTextContent(/You, but don't tell anyone./);

      const feedbackModal = () => screen.findByTestId("metabot-feedback-modal");
      const thumbsUp = () =>
        within(lastMessage!).findByTestId("metabot-chat-message-thumbs-up");
      const thumbsDown = () =>
        within(lastMessage!).findByTestId("metabot-chat-message-thumbs-down");

      expect(await thumbsUp()).toBeInTheDocument();
      expect(await thumbsDown()).toBeInTheDocument();
      await userEvent.click(await thumbsDown());

      expect(await feedbackModal()).toBeInTheDocument();
      await userEvent.click(
        await within(await feedbackModal()).findByRole("button", {
          name: /Submit/,
        }),
      );

      expect(fetchMock.callHistory.calls(feedbackPath)).toHaveLength(1);

      expect(await thumbsUp()).toBeDisabled();
      expect(await thumbsDown()).toBeDisabled();
    });

    it("should present the user an option to retry a response", async () => {
      setup();
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

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
        // add two messages to ensure we rollback both
        textChunks: [`0:"Let me think..."`, ...whoIsYourFavoriteResponse],
      });
      await enterChatMessage("Who is your favorite?");

      const beforeMessages = await screen.findByTestId("metabot-chat-messages");
      expect(beforeMessages).toHaveTextContent(/Let me think.../);
      expect(beforeMessages).toHaveTextContent(/You, but don't tell anyone./);

      mockAgentEndpoint({
        textChunks: [
          `0:"The answer is always you."`,
          `2:{"type":"state","version":1,"value":{"queries":{}}}`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        ],
      });
      await userEvent.click(
        await screen.findByTestId("metabot-chat-message-retry"),
      );

      const afterMessages = await screen.findByTestId("metabot-chat-messages");

      // rolled back both messages
      expect(afterMessages).not.toHaveTextContent(/Let me think.../);
      expect(afterMessages).not.toHaveTextContent(
        /You, but don't tell anyone./,
      );

      // shows the new one
      expect(afterMessages).toHaveTextContent(/The answer is always you./);
    });

    it("should not show retry option for error messages", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/agent-streaming`, 500);

      await enterChatMessage("Who is your favorite?");

      const lastMessage = await lastChatMessage();
      expect(lastMessage).toHaveTextContent(METABOT_ERR_MSG.agentOffline);
      expect(
        within(lastMessage!).queryByTestId("metabot-chat-message-retry"),
      ).not.toBeInTheDocument();
    });

    it("should be able to set the prompt input's value from anywhere in the app", async () => {
      const AnotherComponent = () => {
        const { setPrompt } = useMetabotAgent("omnibot");

        return (
          <button onClick={() => setPrompt("TEST VAL")}>CLICK HERE</button>
        );
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
          textChunks: whoIsYourFavoriteResponse,
        });

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
          expect(agentSpy).toHaveBeenCalledTimes(1);
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
            fetchMock.callHistory.calls(
              `path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`,
            ),
          ).toHaveLength(1);
        });

        await userEvent.click(await resetChatButton());

        await waitFor(async () => {
          expect(
            fetchMock.callHistory.calls(
              `path:/api/ee/metabot-v3/metabot/1/prompt-suggestions`,
            ),
          ).toHaveLength(2);
        });
      });
    });
  });

  describe("message", () => {
    it("should properly send chat messages", async () => {
      setup();

      mockAgentEndpoint(
        { textChunks: whoIsYourFavoriteResponse, initialDelay: 50 }, // small delay to cause loading state
      );

      await enterChatMessage("Who is your favorite?", false);
      expect(await input()).toHaveTextContent("Who is your favorite?");

      await enterChatMessage("Who is your favorite?");
      expect(await responseLoader()).toBeInTheDocument();
      expect(
        await screen.findByText("You, but don't tell anyone."),
      ).toBeInTheDocument();

      // should auto-clear input + refocus
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

  describe("tool calls", () => {
    it("should show list each tool being called as it comes in and cleared when finished", async () => {
      setup();

      const [pause1, pause2] = createPauses(2);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `9:{"toolCallId":"x","toolName":"analyze_data","args":""}\n`;
            yield `a:{"toolCallId":"x","result":""}\n`;
            await pause1.promise;
            yield `9:{"toolCallId":"y","toolName":"analyze_chart","args":""}\n`;
            yield `a:{"toolCallId":"y","result":""}\n`;
            await pause2.promise;
            yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
          })(),
        ),
      });

      await enterChatMessage("Analyze this query");

      // should show first tool call
      expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
      expect(
        screen.queryByText("Inspecting the visualization"),
      ).not.toBeInTheDocument();

      pause1.resolve();

      // should show both tool calls
      expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
      expect(
        await screen.findByText("Inspecting the visualization"),
      ).toBeInTheDocument();

      pause2.resolve();

      // should clear tool call notifications at end of request
      await waitFor(() => {
        expect(
          screen.queryByText("Analyzing the data"),
        ).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(
          screen.queryByText("Inspecting the visualization"),
        ).not.toBeInTheDocument();
      });
    });

    it("should clear out list of tool calls when new text comes in", async () => {
      setup();

      const [pause1, pause2, pause3] = createPauses(3);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `9:{"toolCallId":"x","toolName":"analyze_data","args":""}\n`;
            yield `a:{"toolCallId":"x","result":""}\n`;
            await pause1.promise;
            yield `0:"Hey."`;
            await pause2.promise;
            yield `9:{"toolCallId":"y","toolName":"analyze_chart","args":""}\n`;
            yield `a:{"toolCallId":"y","result":""}\n`;
            await pause3.promise;
            yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
          })(),
        ),
      });

      await enterChatMessage("Analyze this query");

      // should show first tool call
      expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
      expect(
        screen.queryByText("Inspecting the visualization"),
      ).not.toBeInTheDocument();

      pause1.resolve();

      // should not show any tool calls, only the new text
      await waitFor(() => {
        expect(
          screen.queryByText("Analyzing the data"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText("Hey.")).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByText("Inspecting the visualization"),
        ).not.toBeInTheDocument();
      });

      pause2.resolve();

      // expect text and new tool call to be in the document
      expect(await screen.findByText("Hey.")).toBeInTheDocument();
      expect(
        await screen.findByText("Inspecting the visualization"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Analyzing the data")).not.toBeInTheDocument();

      pause3.resolve();

      await waitFor(async () => {
        await assertConversation([
          ["user", "Analyze this query"],
          ["agent", "Hey."],
        ]);
      });
    });

    it("should start a new message if there's tool calls between streamed text parts", async () => {
      setup();
      mockAgentEndpoint(
        {
          textChunks: [
            `0:"Response 1"`,
            `9:{"toolCallId":"x","toolName":"x","args":""}`,
            `a:{"toolCallId":"x","result":""}`,
            `0:"Response 2"`,
            `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
          ],
        }, // small delay to cause loading state
      );
      await enterChatMessage("Request");

      await assertConversation([
        ["user", "Request"],
        ["agent", "Response 1"],
        ["agent", "Response 2"],
      ]);
    });

    it("should be able to stop a response via stop button", async () => {
      setup();

      const [pause1] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `0:"You, but "\n`;
            await pause1.promise;
            yield `0:"don't tell anyone."\n`;
          })(),
        ),
      });

      await enterChatMessage("Who is your favorite?");
      await userEvent.click(await stopResponseButton());
      pause1.resolve();

      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
      await enterChatMessage("Who is your favorite?");
      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", "You, but"],
        ["user", "Who is your favorite?"],
        ["agent", "You, but don't tell anyone."],
      ]);
    });

    it("should be able to stop a response via escape press", async () => {
      setup();

      const [pause1] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `0:"You, but "\n`;
            await pause1.promise;
            yield `0:"don't tell anyone."\n`;
          })(),
        ),
      });

      await enterChatMessage("Who is your favorite?");
      await userEvent.type(await input(), "{Escape}");
      pause1.resolve();

      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
      await enterChatMessage("Who is your favorite?");
      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", "You, but"],
        ["user", "Who is your favorite?"],
        ["agent", "You, but don't tell anyone."],
      ]);
    });
  });

  describe("errors", () => {
    it("should handle service error response", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/agent-streaming`, 500);

      await enterChatMessage("Who is your favorite?");

      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", METABOT_ERR_MSG.agentOffline],
      ]);
      expect(await input()).toHaveTextContent("Who is your favorite?");
    });

    it("should handle non-successful responses", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/agent-streaming`, 400);

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

    it("should remove previous error messages and prompt when submiting next prompt", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/agent-streaming`, 500);

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

  describe("context", () => {
    it("should send along default context", async () => {
      setup();
      const agentSpy = mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
      });

      await enterChatMessage("Who is your favorite?");

      expect(
        isMatching(
          { current_time_with_timezone: P.string },
          (await lastReqBody(agentSpy))?.context,
        ),
      ).toEqual(true);
    });

    it("should send along available actions in context", async () => {
      setup({
        currentUser: createMockUser({
          permissions: createMockUserPermissions({ can_create_queries: true }),
        }),
      });
      fetchMock.removeRoutes({ names: ["database-list"] });
      setupDatabaseListEndpoint([
        createMockDatabase({
          is_saved_questions: false,
          native_permissions: "none",
        }),
      ]);

      const agentSpy = mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
      });

      await enterChatMessage("Who is your favorite?");

      expect(
        _.pick((await lastReqBody(agentSpy))?.context, "capabilities"),
      ).toEqual({
        capabilities: [
          "frontend:navigate_user_v1",
          "permission:save_questions",
        ],
      });
    });

    it("should allow components to register additional context", async () => {
      const agentSpy = mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
      });

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
          (await lastReqBody(agentSpy))?.context,
        ),
      ).toBe(true);
    });
  });

  describe("convo state", () => {
    it("should update the convo state on a successful request", async () => {
      const { store } = setup();
      const getConvoReqState = () =>
        getMetabotRequestState(store.getState(), "omnibot");

      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `2:{"type":"state","version":1,"value":{"queries":{}}}\n`;
            // assert that state hasn't been updated mid-response
            expect(getConvoReqState()).toEqual({});
            yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
          })(),
        ),
      });

      expect(getConvoReqState()).toEqual({});
      await enterChatMessage("Request");
      expect(getConvoReqState()).toEqual({ queries: {} });
    });

    it("should not update the convo state on a failed request", async () => {
      const { store } = setup();
      const getConvoReqState = () =>
        getMetabotRequestState(store.getState(), "omnibot");

      mockAgentEndpoint({
        textChunks: [
          `2:{"type":"state","version":1,"value":{"queries":{}}}`,
          ...erroredResponse,
        ],
      });

      expect(getConvoReqState()).toEqual({});
      await enterChatMessage("Request");
      expect(getConvoReqState()).toEqual({});
    });

    it("should preserve conversation state if aborted response didn't contain a state data object", async () => {
      const { store } = setup();
      const getConvoReqState = () =>
        getMetabotRequestState(store.getState(), "omnibot");

      // insert some state via previous convo
      mockAgentEndpoint({
        textChunks: [
          `0:"here ya go"`,
          `2:{"type":"state","version":1,"value":{"testing":123}}`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        ],
      });
      await enterChatMessage("gimme state plz");
      assertConversation([
        ["user", "gimme state plz"],
        ["agent", "here ya go"],
      ]);
      expect(getConvoReqState()).toEqual({ testing: 123 });

      const [pause1] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `0:"blah blah blah"\n`;
            await pause1.promise;
            yield `0:"something something"\n`;
          })(),
        ),
      });

      await enterChatMessage("i'm going to cancel this request...");
      assertConversation([
        ["user", "gimme state plz"],
        ["agent", "here ya go"],
        ["user", "i'm going to cancel this request..."],
        ["agent", "blah blah blah"],
      ]);
      await userEvent.click(await stopResponseButton());
      pause1.resolve();

      expect(getConvoReqState()).toEqual({ testing: 123 });
    });

    it("should use new state object if aborted response contained one", async () => {
      const { store } = setup();

      // insert some state via previous convo
      const [pause1] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `2:{"type":"state","version":1,"value":{"testing":123}}`,
              await pause1.promise;
          })(),
        ),
      });
      await enterChatMessage("hi");
      await userEvent.click(await stopResponseButton());
      const reqState = getMetabotRequestState(store.getState(), "omnibot");
      expect(reqState).toEqual({ testing: 123 });
    });
  });

  describe("history", () => {
    it("should send conversation history along with future messages", async () => {
      setup();

      // create some chat history + wait for a response
      mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
        initialDelay: 50,
      });
      await enterChatMessage("Who is your favorite?");
      expect(
        await screen.findByText("You, but don't tell anyone."),
      ).toBeInTheDocument();

      // send another message and check that the proper history is being sent along
      const agentSpy = mockAgentEndpoint({
        textChunks: [], // next response doesn't matter
      });
      await enterChatMessage("Hi!");
      const reqBody = await lastReqBody(agentSpy);
      expect(reqBody?.history).toEqual([
        { content: "Who is your favorite?", role: "user" },
        { content: "You, but don't tell anyone.", role: "assistant" },
      ]);
    });

    it("should not clear history when metabot is hidden or opened", async () => {
      const { store } = setup();
      const agentSpy = mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
      });

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() => expect(agentSpy).toHaveBeenCalledTimes(1));

      // close, open, and then send another message and check that there is no history
      hideMetabot(store.dispatch);
      showMetabot(store.dispatch);
      await enterChatMessage("Hi!");
      const lastCall = agentSpy.mock.lastCall;
      const reqBody = JSON.parse(String(lastCall?.[1]?.body));
      const sentHistory = reqBody.history;
      expect(sentHistory).not.toEqual([]);
    });

    it("should merge text chunks in the history", async () => {
      const { store } = setup();
      mockAgentEndpoint({
        textChunks: [
          `0:"You, but "`,
          `0:"don't tell anyone."`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        ],
      });

      const initialHistory = getHistory(store.getState(), "omnibot");
      expect(initialHistory).toEqual([]);

      await enterChatMessage("Who is your favorite?");

      const finalHistory = getHistory(store.getState(), "omnibot");
      expect(finalHistory).toHaveLength(2);
      expect(finalHistory[0].role).toBe("user");
      expect(finalHistory[0].content).toBe("Who is your favorite?");
      expect(finalHistory[1].role).toBe("assistant");
      expect(finalHistory[1].content).toBe("You, but don't tell anyone.");
    });

    it("should clear history when the user hits the reset button", async () => {
      const { store } = setup();
      const getState = () =>
        getMetabotConversation(store.getState(), "omnibot");
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", "You, but don't tell anyone."],
      ]);

      const beforeResetState = getState();
      expect(_.omit(beforeResetState.messages[0], ["id"])).toStrictEqual({
        role: "user",
        type: "text",
        message: "Who is your favorite?",
      });
      expect(_.omit(beforeResetState.messages[1], ["id"])).toStrictEqual({
        role: "agent",
        type: "text",
        message: "You, but don't tell anyone.",
      });

      await userEvent.click(await resetChatButton());

      const afterResetState = getState();
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
        store.dispatch(
          addUserMessage({
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
          addUserMessage({
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

    it("should manually insert synthetic tool results for aborted requests with unresolved tool calls", async () => {
      const { store } = setup();

      // insert some state via previous convo
      const [pause1] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `9:{"toolCallId":"test","toolName":"test","args":""}`;
            await pause1.promise;
          })(),
        ),
      });
      await enterChatMessage("hi");
      await userEvent.click(await stopResponseButton());
      pause1.resolve();
      expect(getHistory(store.getState(), "omnibot")).toMatchObject([
        { content: "hi", role: "user" },
        {
          role: "assistant",
          tool_calls: [{ arguments: "", id: "test", name: "test" }],
        },
        {
          content: "Tool execution interrupted by user",
          role: "tool",
          tool_call_id: "test",
        },
      ]);
    });
  });

  describe("reaction state", () => {
    it("should clear navigateToPath and suggestedTransforms when resetting omnibot conversation", async () => {
      const { store } = setup();
      const getReactions = () => getMetabotReactionsState(store.getState());

      act(() => {
        store.dispatch(setNavigateToPath("/some/path"));
        store.dispatch(
          addSuggestedTransform({
            ...createMockTransform(),
            active: true,
            suggestionId: "test-suggestion",
          }),
        );
      });

      expect(getReactions().navigateToPath).toBe("/some/path");
      expect(getReactions().suggestedTransforms).toHaveLength(1);

      await userEvent.click(await resetChatButton());

      expect(getReactions().navigateToPath).toBeNull();
      expect(getReactions().suggestedTransforms).toEqual([]);
    });
  });

  describe("experimental", () => {
    describe("debug mode", () => {
      const mockResponse = () => {
        mockAgentEndpoint({
          textChunks: [
            `0:"Before"`,
            `9:{"toolCallId":"debug_test","toolName":"debug_test","args":""}`,
            `a:{"toolCallId":"debug_test","result":""}`,
            `0:"After"`,
            `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
          ],
        });
      };

      it("should not show tool_call messages in chat if debug mode is disabled", async () => {
        setup();
        mockResponse();

        await enterChatMessage("Don't show me tool call messages");
        await assertConversation([
          ["user", "Don't show me tool call messages"],
          ["agent", "Before"],
          ["agent", "After"],
        ]);
      });

      it("should show tool_call messages in chat if debug mode is enabled", async () => {
        setup();
        mockResponse();

        await enterChatMessage("/debug");
        await enterChatMessage("Don't show me tool call messages");
        await assertConversation([
          ["user", "Don't show me tool call messages"],
          ["agent", "Before"],
          ["agent", "debug_test"],
          ["agent", "After"],
        ]);
      });
    });
  });
});

const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];

const erroredResponse = [
  `3:{"type": "error", "value": "Couldn't do the thing"}`,
  `d:{"finishReason":"error","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
