import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  type RenderWithProvidersOptions,
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
} from "metabase/api/ai-streaming/test-utils";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import type { MetabotInfo, User } from "metabase-types/api";
import {
  createMockMetabotInfo,
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { Metabot } from "../components/Metabot";
import { FIXED_METABOT_ENTITY_IDS, FIXED_METABOT_IDS } from "../constants";
import { MetabotProvider } from "../context";
import {
  type MetabotAgentId,
  type MetabotState,
  metabotReducer,
  setVisible,
} from "../state";
import { getMetabotInitialState } from "../state/reducer-utils";

export { createMockReadableStream, createPauses };

export const mockAgentEndpoint = (params: MockStreamedEndpointParams) =>
  mockStreamedEndpoint("/api/metabot/agent-streaming", params);

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
  const path = "path:/api/metabot/feedback";
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
  expectedMessages: ["user" | "agent", string | RegExp][],
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
  `f:{"messageId":"msg_test_favorite"}`,
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];

export const erroredResponse = [
  `3:"Anthropic API key expired or invalid"`,
  `d:{"finishReason":"error","usage":{}}`,
];

// Admin-configured quota exceeded — carries ai_usage_limit_reached error-code
export const adminQuotaLimitErroredResponse = [
  `3:{"message":"You have reached your AI usage limit for the current period. Please contact your administrator.","error-code":"ai_usage_limit_reached"}`,
  `d:{"finishReason":"error","usage":{}}`,
];

type DefaultMetabotOverrides = {
  default?: Partial<MetabotInfo>;
  embedded?: Partial<MetabotInfo>;
};

export function buildDefaultMetabots(
  overrides: DefaultMetabotOverrides = {},
): MetabotInfo[] {
  return [
    createMockMetabotInfo({
      id: FIXED_METABOT_IDS.DEFAULT,
      entity_id: FIXED_METABOT_ENTITY_IDS.DEFAULT,
      ...overrides.default,
    }),
    createMockMetabotInfo({
      id: FIXED_METABOT_IDS.EMBEDDED,
      entity_id: FIXED_METABOT_ENTITY_IDS.EMBEDDED,
      name: "Embedded Metabot",
      ...overrides.embedded,
    }),
  ];
}

// Setup function for metabot tests
export function setup(
  options: {
    ui?: React.ReactElement;
    metabotInitialState?: MetabotState;
    currentUser?: User | null | undefined;
    promptSuggestions?: { prompt: string }[];
    isHosted?: boolean;
    storeInitialState?: RenderWithProvidersOptions["storeInitialState"];
    customReducers?: RenderWithProvidersOptions["customReducers"];
  } | void,
) {
  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "is-hosted?": options?.isHosted ?? false,
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
    metabotInitialState = metabotState,
    promptSuggestions = [],
    storeInitialState = {},
    customReducers,
  } = options || {};

  fetchMock.get(
    `path:/api/metabot/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: promptSuggestions, offset: 0, limit: 3, total: 3 },
  );
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(),
  );
  setupDatabaseListEndpoint([]);

  const { store, rerender } = renderWithProviders(
    <MetabotProvider>{ui}</MetabotProvider>,
    {
      storeInitialState: createMockState({
        ...storeInitialState,
        settings: {
          ...settings,
          ...(storeInitialState.settings ?? {}),
        },
        currentUser: currentUser ? currentUser : undefined,
        metabot: metabotInitialState,
      }),
      customReducers: {
        ...customReducers,
        metabot: metabotReducer,
      },
    },
  );

  return {
    rerender,
    conversationIds: Object.keys(metabotInitialState.conversations),
    store: store as Omit<typeof store, "getState"> & {
      getState: () => State;
    },
  };
}
