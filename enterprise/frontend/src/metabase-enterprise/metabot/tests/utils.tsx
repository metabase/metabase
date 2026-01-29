import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
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

import { Metabot } from "../components/Metabot";
import { FIXED_METABOT_IDS } from "../constants";
import { MetabotProvider } from "../context";
import {
  type MetabotAgentId,
  type MetabotState,
  type MetabotStoreState,
  metabotReducer,
  setVisible,
} from "../state";
import { getMetabotInitialState } from "../state/reducer-utils";

export { createMockReadableStream, createPauses };

export const mockAgentEndpoint = (params: MockStreamedEndpointParams) =>
  mockStreamedEndpoint("/api/ee/metabot-v3/native-agent-streaming", params);

export const chat = () => screen.findByTestId("metabot-chat");
export const chatMessages = () =>
  screen.findAllByTestId("metabot-chat-message");
export const lastChatMessage = async () => (await chatMessages()).at(-1);
export const input = async () => {
  const chatInput = await screen.findByTestId("metabot-chat-input");
  return chatInput.querySelector('[contenteditable="true"]')!;
};
export const enterChatMessage = async (message: string, send = true) => {
  // using userEvent.type works locally but in CI characters are sometimes dropped
  // so "Who is your favorite?" becomes something like "Woi or fvrite?"
  const editor = await input();
  editor.textContent = message;
  fireEvent.input(editor, {
    target: { textContent: message },
  });
  if (send) {
    await userEvent.type(await input(), "{Enter}");
  }
};
export const sendMessageButton = () =>
  screen.findByTestId("metabot-send-message");
export const stopResponseButton = () =>
  screen.findByTestId("metabot-stop-response");
export const closeChatButton = () => screen.findByTestId("metabot-close-chat");
export const responseLoader = () =>
  screen.findByTestId("metabot-response-loader");
export const resetChatButton = () => screen.findByTestId("metabot-reset-chat");

// Feedback helpers
export const feedbackModal = () =>
  screen.findByTestId("metabot-feedback-modal");
export const thumbsUp = (message: HTMLElement) =>
  within(message).findByTestId("metabot-chat-message-thumbs-up");
export const thumbsDown = (message: HTMLElement) =>
  within(message).findByTestId("metabot-chat-message-thumbs-down");
export const mockFeedbackEndpoint = () => {
  const path = "path:/api/ee/metabot-v3/feedback";
  fetchMock.post(path, 204);
  return {
    calls: () => fetchMock.callHistory.calls(path),
  };
};

export const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
export const assertNotVisible = async () =>
  await waitFor(() => {
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
  });

// NOTE: for some reason the keyboard shortcuts won't work with tinykeys while testing, using redux for now...
export const hideMetabot = (
  dispatch: any,
  agentId: MetabotAgentId = "omnibot",
) => act(() => dispatch(setVisible({ agentId, visible: false })));
export const showMetabot = (
  dispatch: any,
  agentId: MetabotAgentId = "omnibot",
) => act(() => dispatch(setVisible({ agentId, visible: true })));

export const assertConversation = async (
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
    expect(realMessages.length).toBe(expectedMessages.length);
    expectedMessages.forEach(([expectedRole, expectedMessage], index) => {
      const realMessage = realMessages[index];
      expect(realMessage).toHaveAttribute("data-message-role", expectedRole);
      expect(realMessage).toHaveTextContent(expectedMessage);
    });
  }
};

export const lastReqBody = async (
  agentSpy: ReturnType<typeof mockAgentEndpoint>,
) => {
  await waitFor(() => expect(agentSpy).toHaveBeenCalled());
  return JSON.parse(agentSpy.mock.lastCall?.[1]?.body as string);
};

// Common mock response fixtures
export const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];

export const erroredResponse = [
  `3:{"type": "error", "value": "Couldn't do the thing"}`,
  `d:{"finishReason":"error","usage":{"promptTokens":4916,"completionTokens":8}}`,
];

// Setup function for metabot tests
export function setup(
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
