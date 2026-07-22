import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupGetMetabotConversationTitleEndpoint,
  setupListMetabotConversationsEndpoint,
} from "__support__/server-mocks";
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
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import {
  type MockStreamedEndpointParams,
  createMockReadableStream,
  createMockSSEStream,
  createPauses,
  mockStreamedEndpoint,
} from "metabase/api/ai-streaming/test-utils";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type {
  MetabotConversation,
  MetabotInfo,
  User,
} from "metabase-types/api";
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

export { createMockReadableStream, createMockSSEStream, createPauses };

const mockReducedMotion = () => {
  window.matchMedia = (query: string) =>
    // jsdom has no matchMedia; this stub only needs the fields our code reads.
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
};

export const mockAgentEndpoint = (params: MockStreamedEndpointParams) =>
  mockStreamedEndpoint("/api/metabot/agent-streaming", params);

export const chat = () => screen.findByTestId("metabot-chat");
export const conversationTitle = () =>
  screen.findByTestId("metabot-conversation-title");
export const queryConversationTitle = () =>
  screen.queryByTestId("metabot-conversation-title");
// chain-of-thought rows are UI furniture, not conversation content, so they're
// excluded by default to keep message-count assertions about the actual exchange
export const chatMessages = async ({
  includeChainOfThought = false,
}: { includeChainOfThought?: boolean } = {}) => {
  const messages = await screen.findAllByTestId("metabot-chat-message");
  return includeChainOfThought
    ? messages
    : messages.filter(
        (el) => !within(el).queryByTestId("metabot-chain-of-thought"),
      );
};
export const lastChatMessage = async (options?: {
  includeChainOfThought?: boolean;
}) => (await chatMessages(options)).at(-1);
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
export const newConversationButton = () =>
  screen.findByTestId("metabot-new-conversation");

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
    return;
  }

  await waitFor(async () => {
    const realMessages = await chatMessages();
    expect(realMessages.length).toBe(expectedMessages.length);
    expectedMessages.forEach(([expectedRole, expectedMessage], index) => {
      const realMessage = realMessages[index];
      expect(realMessage).toHaveAttribute("data-message-role", expectedRole);
      expect(realMessage).toHaveTextContent(expectedMessage);
    });
  });
};

export const lastReqBody = async (
  agentSpy: ReturnType<typeof mockAgentEndpoint>,
) => {
  await waitFor(() => expect(agentSpy).toHaveBeenCalled());
  // The client calls `fetch(new Request(url, init))`, so the body lives on the
  // Request object rather than a separate init arg.
  const [request] =
    agentSpy.mock.calls.findLast(
      ([req]) =>
        req instanceof Request &&
        req.url.includes("/api/metabot/agent-streaming"),
    ) ?? [];
  // Unjustified type cast. FIXME
  return JSON.parse(await (request as Request).clone().text());
};

// Common mock response fixtures
export const whoIsYourFavoriteResponse: SSEEvent[] = [
  { type: "start", messageId: "msg_test_favorite" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "You, but don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", data: { queries: {} } },
];

export const erroredResponse: SSEEvent[] = [
  { type: "error", errorText: "Anthropic API key expired or invalid" },
];

// Admin-configured quota exceeded — the error code rides on the trailing
// `finish` event's messageMetadata
export const adminQuotaLimitErroredResponse: SSEEvent[] = [
  {
    type: "error",
    errorText:
      "You have reached your AI usage limit for the current period. Please contact your administrator.",
  },
  {
    type: "finish",
    finishReason: "error",
    messageMetadata: { errorCode: "ai_usage_limit_reached" },
  },
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
    storeInitialState?: RenderWithProvidersOptions["storeInitialState"];
    customReducers?: RenderWithProvidersOptions["customReducers"];
    isConfigured?: boolean;
    conversations?: MetabotConversation[];
    conversationTitle?: string | null;
    withRouter?: boolean;
    initialRoute?: string;
  } | void,
) {
  mockReducedMotion(); // induce reduced motion to avoid waiting for streaming to finish

  const settings = mockSettings({
    "llm-metabot-configured?": options?.isConfigured ?? true,
  });

  setupEnterprisePlugins();

  const {
    ui = <Metabot />,
    currentUser = createMockUser(),
    metabotInitialState,
    promptSuggestions = [],
    storeInitialState = {},
    customReducers,
    conversations = [],
    conversationTitle = "Test Conversation Title",
    withRouter = false,
    initialRoute,
  } = options || {};

  const visibleState = assocIn(
    getMetabotInitialState(),
    ["conversations", "omnibot", "visible"],
    true,
  );
  const metabotState =
    metabotInitialState ??
    Object.keys(visibleState.conversations).reduce(
      (state, agentId) =>
        assocIn(
          state,
          ["conversations", agentId, "title"],
          conversationTitle || undefined,
        ),
      visibleState,
    );

  fetchMock.get(
    `path:/api/metabot/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: promptSuggestions, offset: 0, limit: 3, total: 3 },
  );
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(),
  );
  setupDatabaseListEndpoint([]);
  setupListMetabotConversationsEndpoint(conversations);
  setupGetMetabotConversationTitleEndpoint(
    conversationTitle
      ? { status: "ready", title: conversationTitle }
      : { status: "pending", title: null },
  );

  const content =
    withRouter && initialRoute ? (
      <Route
        path={initialRoute}
        element={<MetabotProvider>{ui}</MetabotProvider>}
      />
    ) : (
      <MetabotProvider>{ui}</MetabotProvider>
    );

  const { store, rerender, history } = renderWithProviders(content, {
    storeInitialState: createMockState({
      ...storeInitialState,
      settings: {
        ...settings,
        ...(storeInitialState.settings ?? {}),
      },
      currentUser: currentUser ? currentUser : undefined,
      metabot: metabotState,
    }),
    customReducers: {
      ...customReducers,
      metabot: metabotReducer,
    },
    withRouter,
    ...(initialRoute ? { initialRoute } : {}),
  });

  return {
    rerender,
    history,
    conversationIds: Object.keys(metabotState.conversations),
    // Unjustified type cast. FIXME
    store: store as Omit<typeof store, "getState"> & {
      getState: () => State;
    },
  };
}
