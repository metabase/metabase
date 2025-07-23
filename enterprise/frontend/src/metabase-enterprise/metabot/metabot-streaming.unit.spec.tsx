// NOTE: these tests can replace their counterparts in the metabot.unit.spec.tsx once streaming becomes the default

import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  type MockStreamedEndpointParams,
  createMockReadableStream,
  createPauses,
  mockStreamedEndpoint,
} from "metabase-enterprise/api/ai-streaming/test-utils";
import type { User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "./components/Metabot";
import { FIXED_METABOT_IDS, METABOT_ERR_MSG } from "./constants";
import { MetabotProvider } from "./context";
import {
  type MetabotState,
  getHistory,
  getMetabotInitialState,
  getMetabotState,
  metabotReducer,
} from "./state";

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

const chatMessages = () => screen.findAllByTestId("metabot-chat-message");
const lastChatMessage = async () => (await chatMessages()).at(-1);
const input = () => screen.findByTestId("metabot-chat-input");
const enterChatMessage = async (message: string, send = true) =>
  userEvent.type(await input(), `${message}${send ? "{Enter}" : ""}`);
const responseLoader = () => screen.findByTestId("metabot-response-loader");
const resetChatButton = () => screen.findByTestId("metabot-reset-chat");

const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();

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
  });

  describe("message", () => {
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
      const agentSpy2 = mockAgentEndpoint({
        textChunks: [], // next response doesn't matter
      });
      await enterChatMessage("Hi!");
      const reqBody = await lastReqBody(agentSpy2);
      expect(reqBody?.history).toEqual([
        { content: "Who is your favorite?", role: "user" },
        { content: "You, but don't tell anyone.", role: "assistant" },
      ]);
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
