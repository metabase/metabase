import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
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
import { downloadObjectAsJson } from "metabase/lib/download";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  type MockStreamedEndpointParams,
  createMockReadableStream,
  createPauses,
  mockStreamedEndpoint,
} from "metabase-enterprise/api/ai-streaming/test-utils";
import type { User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
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
  addUserMessage,
  getHistory,
  getMetabot,
  getMetabotConversationId,
  getMetabotInitialState,
  getMetabotState,
  metabotReducer,
  setVisible,
} from "./state";

jest.mock("metabase/lib/download", () => ({
  downloadObjectAsJson: jest.fn(),
}));

const mockAgentEndpoint = (params: MockStreamedEndpointParams) =>
  mockStreamedEndpoint("/api/ee/metabot-v3/v2/agent-streaming", params);

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

  const {
    ui = <Metabot />,
    currentUser = createMockUser(),
    metabotPluginInitialState = {
      ...getMetabotInitialState(),
      visible: true,
      useStreaming: true,
    },
    promptSuggestions = [],
  } = options || {};

  fetchMock.get(
    `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: promptSuggestions, offset: 0, limit: 3, total: 3 },
  );
  setupDatabaseListEndpoint([]);

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
const chatMessages = () => screen.findAllByTestId("metabot-chat-message");
const lastChatMessage = async () => (await chatMessages()).at(-1);
const input = () => screen.findByTestId("metabot-chat-input");
const enterChatMessage = async (message: string, send = true) =>
  userEvent.type(await input(), `${message}${send ? "{Enter}" : ""}`);
const closeChatButton = () => screen.findByTestId("metabot-close-chat");
const responseLoader = () => screen.findByTestId("metabot-response-loader");
const resetChatButton = () => screen.findByTestId("metabot-reset-chat");

const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
const assertNotVisible = async () =>
  await waitFor(() => {
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
  });

// NOTE: for some reason the keyboard shortcuts won't work with tinykeys while testing, using redux for now...
const hideMetabot = (dispatch: any) => act(() => dispatch(setVisible(false)));
const showMetabot = (dispatch: any) => act(() => dispatch(setVisible(true)));

const assertConversation = async (
  expectedMessages: ["user" | "agent", string][],
) => {
  if (!expectedMessages.length) {
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-chat-message"),
      ).not.toBeInTheDocument();
    });
  } else {
    const realMessages = await chatMessages();
    expect(expectedMessages.length).toBe(realMessages.length);
    expectedMessages.forEach(([expectedRole, expectedMessage], index) => {
      const realMessage = realMessages[index];
      expect(realMessage).toHaveAttribute("data-message-role", expectedRole);
      expect(realMessage).toHaveTextContent(expectedMessage);
    });
  }
};

const lastReqBody = async (agentSpy: ReturnType<typeof mockAgentEndpoint>) => {
  await waitFor(() => expect(agentSpy).toHaveBeenCalled());
  return JSON.parse(agentSpy.mock.lastCall?.[1]?.body as string);
};

describe("metabot-streaming", () => {
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

    it("should not render markdown for user messages", async () => {
      setup();
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

      const msg = "# Who is your favorite?";
      await enterChatMessage(msg);
      expect(await screen.findByText(msg)).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
    });

    it("should render markdown for metabot's replies", async () => {
      setup();
      mockAgentEndpoint({
        textChunks: [
          `0:"# You, but don't tell anyone."`,
          `2:{"type":"state","version":1,"value":{"queries":{}}}`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        ],
      });
      await enterChatMessage("Who is your favorite?");

      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent(`You, but don't tell anyone.`);
    });

    it("should present the user an option to provide feedback", async () => {
      setup();
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

      await enterChatMessage("Who is your favorite?");
      const lastMessage = await lastChatMessage();
      expect(lastMessage).toHaveTextContent(/You, but don't tell anyone./);

      const feedbackModal = () => screen.findByTestId("metabot-feedback-modal");
      const thumbsUp = () =>
        within(lastMessage!).findByTestId("metabot-chat-message-thumbs-up");
      const thumbsDown = () =>
        within(lastMessage!).findByTestId("metabot-chat-message-thumbs-down");
      const mockDownloadObjectAsJson =
        downloadObjectAsJson as jest.MockedFunction<
          typeof downloadObjectAsJson
        >;

      expect(await thumbsUp()).toBeInTheDocument();
      expect(await thumbsDown()).toBeInTheDocument();
      await userEvent.click(await thumbsDown());

      expect(await feedbackModal()).toBeInTheDocument();
      await userEvent.click(
        await within(await feedbackModal()).findByRole("button", {
          name: /Download/,
        }),
      );

      expect(mockDownloadObjectAsJson).toHaveBeenCalledTimes(1);

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
      fetchMock.post(`path:/api/ee/metabot-v3/v2/agent-streaming`, 500);

      await enterChatMessage("Who is your favorite?");

      const lastMessage = await lastChatMessage();
      expect(lastMessage).toHaveTextContent(METABOT_ERR_MSG.agentOffline);
      expect(
        within(lastMessage!).queryByTestId("metabot-chat-message-retry"),
      ).not.toBeInTheDocument();
    });

    it("should be able to set the prompt input's value from anywhere in the app", async () => {
      const AnotherComponent = () => {
        const { setPrompt } = useMetabotAgent();

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

      expect(await input()).toHaveValue("");
      await userEvent.click(await screen.findByText("CLICK HERE"));
      expect(await input()).toHaveValue("TEST VAL");
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
    it("should have a conversation id before sending any messages", async () => {
      const { store } = setup();
      const state = store.getState() as any;
      expect(getMetabotConversationId(state)).not.toBeUndefined();
    });

    it("should properly send chat messages", async () => {
      setup();

      mockAgentEndpoint(
        { textChunks: whoIsYourFavoriteResponse, initialDelay: 50 }, // small delay to cause loading state
      );

      await enterChatMessage("Who is your favorite?", false);
      expect(await input()).toHaveValue("Who is your favorite?");

      await enterChatMessage("Who is your favorite?");
      expect(await responseLoader()).toBeInTheDocument();
      expect(
        await screen.findByText("You, but don't tell anyone."),
      ).toBeInTheDocument();

      // should auto-clear input + refocus
      expect(await input()).toHaveValue("");
      expect(await input()).toHaveFocus();
    });

    it("should properly handle partial messages", async () => {
      setup();

      const [pause1] = createPauses(2);
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
  });

  describe("errors", () => {
    it("should handle service error response", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/v2/agent-streaming`, 500);

      await enterChatMessage("Who is your favorite?");

      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", METABOT_ERR_MSG.agentOffline],
      ]);
      expect(await input()).toHaveValue("Who is your favorite?");
    });

    it("should handle non-successful responses", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/v2/agent-streaming`, 400);

      await enterChatMessage("Who is your favorite?");

      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", METABOT_ERR_MSG.default],
      ]);
      expect(await input()).toHaveValue("Who is your favorite?");
    });

    it("should handle show error if data error part is in response", async () => {
      setup();
      mockAgentEndpoint({ textChunks: erroredResponse });

      await enterChatMessage("Who is your favorite?");

      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", METABOT_ERR_MSG.default],
      ]);
      expect(await input()).toHaveValue("Who is your favorite?");
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
      expect(await input()).toHaveValue("");
    });

    it("should remove previous error messages and prompt when submiting next prompt", async () => {
      setup();
      fetchMock.post(`path:/api/ee/metabot-v3/v2/agent-streaming`, 500);

      await enterChatMessage("Who is your favorite?");

      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", METABOT_ERR_MSG.agentOffline],
      ]);
      expect(await input()).toHaveValue("Who is your favorite?");

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
      setup();
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
      // TODO: make enterprise store
      const getState = () => getMetabotState(store.getState() as any);

      mockAgentEndpoint({
        stream: createMockReadableStream(
          (async function* () {
            yield `2:{"type":"state","version":1,"value":{"queries":{}}}\n`;
            // assert that state hasn't been updated mid-response
            expect(getState()).toEqual({});
            yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
          })(),
        ),
      });

      expect(getState()).toEqual({});
      await enterChatMessage("Request");
      expect(getState()).toEqual({ queries: {} });
    });

    it("should not update the convo state on a failed request", async () => {
      const { store } = setup();
      // TODO: make enterprise store
      const getState = () => getMetabotState(store.getState() as any);

      mockAgentEndpoint({
        textChunks: [
          `2:{"type":"state","version":1,"value":{"queries":{}}}`,
          ...erroredResponse,
        ],
      });

      expect(getState()).toEqual({});
      await enterChatMessage("Request");
      expect(getState()).toEqual({});
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

      const initialHistory = getHistory(store.getState() as any);
      expect(initialHistory).toEqual([]);

      await enterChatMessage("Who is your favorite?");

      const finalHistory = getHistory(store.getState() as any);
      expect(finalHistory).toHaveLength(2);
      expect(finalHistory[0].role).toBe("user");
      expect(finalHistory[0].content).toBe("Who is your favorite?");
      expect(finalHistory[1].role).toBe("assistant");
      expect(finalHistory[1].content).toBe("You, but don't tell anyone.");
    });

    it("should clear history when the user hits the reset button", async () => {
      const { store } = setup();
      const getState = () => getMetabot(store.getState() as any);
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", "You, but don't tell anyone."],
      ]);

      const beforeResetState = getState();
      expect(beforeResetState.conversationId).not.toBe(null);
      expect(_.omit(beforeResetState.messages[0], "id")).toStrictEqual({
        role: "user",
        message: "Who is your favorite?",
      });
      expect(_.omit(beforeResetState.messages[1], "id")).toStrictEqual({
        role: "agent",
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
        store.dispatch(addUserMessage({ id: "1", message: longMsg }));
      });
      expect(await screen.findByText(/xxxxxxx/)).toBeInTheDocument();
      expect(
        screen.queryByText(/This chat is getting long/),
      ).not.toBeInTheDocument();

      act(() => {
        store.dispatch(addUserMessage({ id: "2", message: longMsg }));
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

const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];

const erroredResponse = [
  `3:{"type": "error", "value": "Couldn't do the thing"}`,
  `d:{"finishReason":"error","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
