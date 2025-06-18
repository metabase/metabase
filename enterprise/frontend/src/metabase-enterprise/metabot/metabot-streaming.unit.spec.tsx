// NOTE: these tests can replace their counterparts in the metabot.unit.spec.tsx once streaming becomes the default

import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { uuid } from "metabase/lib/uuid";
import { mockStreamedEndpoint } from "metabase-enterprise/api/ai-streaming/test-utils";
import type { User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "./components/Metabot";
import { FIXED_METABOT_IDS } from "./constants";
import { MetabotProvider } from "./context";
import {
  type MetabotState,
  metabotInitialState,
  metabotReducer,
} from "./state";

const mockAgentEndpoint = (
  params: Omit<Parameters<typeof mockStreamedEndpoint>[0], "url">,
) =>
  mockStreamedEndpoint({
    url: "/api/ee/metabot-v3/v2/agent-streaming",
    ...params,
  });

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
      ...metabotInitialState,
      conversationId: uuid(),
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

const input = () => screen.findByTestId("metabot-chat-input");
const enterChatMessage = async (message: string, send = true) =>
  userEvent.type(await input(), `${message}${send ? "{Enter}" : ""}`);
const responseLoader = () => screen.findByTestId("metabot-response-loader");

const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();

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

  describe("history", () => {
    it("should send conversation history along with future messages", async () => {
      setup();

      // create some chat history + wait for a response
      mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
        initialDelay: 500,
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
  });
});

const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
