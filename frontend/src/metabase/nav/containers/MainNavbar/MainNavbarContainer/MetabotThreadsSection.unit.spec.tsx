import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListMetabotChatConversationsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import {
  createMockLocation,
  createMockRoutingState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { MetabotChatConversationSummary } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { MetabotThreadsSection } from "./MetabotThreadsSection";

const CONVERSATIONS: MetabotChatConversationSummary[] = [
  {
    conversation_id: "conv-1",
    created_at: "2026-05-01T10:00:00Z",
    last_message_at: "2026-05-02T10:00:00Z",
    summary: "First summary",
    title: "Revenue by category",
    user_id: 1,
    message_count: 4,
  },
  {
    conversation_id: "conv-2",
    created_at: "2026-04-01T10:00:00Z",
    last_message_at: null,
    summary: null,
    title: "Top customers",
    user_id: 1,
    message_count: 2,
  },
];

interface SetupOpts {
  metabotEnabled?: boolean;
  conversations?: MetabotChatConversationSummary[];
  pathname?: string;
  /** In-memory chat conversations, keyed by agentId (e.g. `chat_<id>`). */
  activeConversations?: Record<
    string,
    {
      title: string | null;
      isProcessing: boolean;
      hasUnreadResponse?: boolean;
      visible?: boolean;
      expanded?: boolean;
    }
  >;
}

function setup({
  metabotEnabled = true,
  conversations = CONVERSATIONS,
  pathname = "/",
  activeConversations,
}: SetupOpts = {}) {
  setupUserMetabotPermissionsEndpoint();
  setupListMetabotChatConversationsEndpoint(conversations);

  const onItemSelect = jest.fn();

  const storeInitialState = createMockState({
    currentUser: createMockUser(),
    settings: mockSettings({ "metabot-enabled?": metabotEnabled }),
    routing: createMockRoutingState({
      locationBeforeTransitions: createMockLocation({ pathname }),
    }),
    ...(activeConversations
      ? { metabot: { conversations: activeConversations } as any }
      : {}),
  });

  const view = renderWithProviders(
    <Route
      path={pathname}
      component={() => <MetabotThreadsSection onItemSelect={onItemSelect} />}
    />,
    {
      storeInitialState,
      initialRoute: pathname,
      withRouter: true,
    },
  );

  return { onItemSelect, ...view };
}

describe("MetabotThreadsSection", () => {
  it("renders a Metabot section with a New chat action and the recent threads", async () => {
    setup();

    const section = await screen.findByRole("section", { name: "Metabot" });
    expect(
      within(section).getByRole("heading", { name: "Metabot" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "New chat" }),
    ).toBeInTheDocument();

    const firstThread = await screen.findByRole("link", {
      name: /Revenue by category/,
    });
    expect(firstThread).toHaveAttribute("href", "/chat/conv-1");
    expect(screen.getByRole("link", { name: /Top customers/ })).toHaveAttribute(
      "href",
      "/chat/conv-2",
    );
  });

  it("marks the conversation matching the current route as selected", async () => {
    setup({ pathname: "/chat/conv-2" });

    const activeItem = await screen.findByRole("listitem", {
      name: "Top customers",
    });
    expect(activeItem).toHaveAttribute("aria-selected", "true");

    const inactiveItem = screen.getByRole("listitem", {
      name: "Revenue by category",
    });
    expect(inactiveItem).toHaveAttribute("aria-selected", "false");
  });

  it("shows an empty state when there are no chats", async () => {
    setup({ conversations: [] });

    expect(await screen.findByText("No chats yet")).toBeInTheDocument();
  });

  it("selects the inline draft on the new-chat home page", async () => {
    setup({
      pathname: "/",
      conversations: [],
      activeConversations: {
        "chat_draft-1": { title: "New chat", isProcessing: false },
      },
    });

    const draft = await screen.findByRole("listitem", { name: "New chat" });
    expect(draft).toHaveAttribute("aria-selected", "true");
  });

  it("selects the conversation shown in the open popup", async () => {
    setup({
      pathname: "/browse/databases",
      conversations: [],
      activeConversations: {
        "chat_popup-1": {
          title: "New chat",
          isProcessing: false,
          visible: true,
        },
      },
    });

    const draft = await screen.findByRole("listitem", { name: "New chat" });
    expect(draft).toHaveAttribute("aria-selected", "true");
  });

  it("surfaces a freshly opened draft as 'New chat' without a loader", async () => {
    setup({
      conversations: [],
      activeConversations: {
        "chat_draft-1": { title: "New chat", isProcessing: false },
      },
    });

    const link = await screen.findByRole("listitem", { name: "New chat" });
    expect(
      within(link).queryByTestId("metabot-thread-loader"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New chat/ })).toHaveAttribute(
      "href",
      "/chat/draft-1",
    );
  });

  it("shows a loader and the live title while a conversation is processing", async () => {
    setup({
      conversations: [],
      activeConversations: {
        "chat_pending-1": { title: "Generating chat", isProcessing: true },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Generating chat",
    });
    expect(
      within(link).getByTestId("metabot-thread-loader"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Generating chat/ }),
    ).toHaveAttribute("href", "/chat/pending-1");
  });

  it("shows a dot when an unfocused conversation finishes processing", async () => {
    const { store } = setup({
      conversations: CONVERSATIONS,
      activeConversations: {
        "chat_conv-1": {
          title: "Revenue by category",
          isProcessing: true,
          visible: false,
          expanded: false,
        },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    expect(
      within(link).getByTestId("metabot-thread-loader"),
    ).toBeInTheDocument();

    store.dispatch(
      metabotActions.setIsProcessing({
        agentId: "chat_conv-1",
        processing: false,
      }),
    );

    expect(
      await within(link).findByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();
    expect(
      within(link).queryByTestId("metabot-thread-loader"),
    ).not.toBeInTheDocument();
  });

  it("does not show a dot when a focused conversation finishes processing", async () => {
    const { store } = setup({
      conversations: CONVERSATIONS,
      activeConversations: {
        "chat_conv-1": {
          title: "Revenue by category",
          isProcessing: true,
          visible: true,
        },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    store.dispatch(
      metabotActions.setIsProcessing({
        agentId: "chat_conv-1",
        processing: false,
      }),
    );

    expect(
      within(link).queryByTestId("metabot-thread-unread-dot"),
    ).not.toBeInTheDocument();
  });

  it("keeps the dot for an unfocused home-page draft selected in the sidebar", async () => {
    const { store } = setup({
      conversations: [],
      pathname: "/",
      activeConversations: {
        "chat_draft-1": {
          title: "New chat",
          isProcessing: true,
          visible: false,
          expanded: false,
        },
      },
    });

    const link = await screen.findByRole("listitem", { name: "New chat" });
    expect(link).toHaveAttribute("aria-selected", "true");

    store.dispatch(
      metabotActions.setIsProcessing({
        agentId: "chat_draft-1",
        processing: false,
      }),
    );

    expect(
      await within(link).findByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();
  });

  it("shows a dot when a previously expanded conversation finishes on another route", async () => {
    const { store } = setup({
      conversations: CONVERSATIONS,
      pathname: "/chat/conv-2",
      activeConversations: {
        "chat_conv-1": {
          title: "Revenue by category",
          isProcessing: true,
          visible: false,
          expanded: true,
        },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    expect(link).toHaveAttribute("aria-selected", "false");

    store.dispatch(
      metabotActions.setIsProcessing({
        agentId: "chat_conv-1",
        processing: false,
      }),
    );

    expect(
      await within(link).findByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();
  });

  it("shows a dot when a processing active conversation disappears into the API list", async () => {
    const { store } = setup({
      conversations: CONVERSATIONS,
      activeConversations: {
        "chat_conv-1": {
          title: "Revenue by category",
          isProcessing: true,
          visible: false,
          expanded: false,
        },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    expect(
      within(link).getByTestId("metabot-thread-loader"),
    ).toBeInTheDocument();

    store.dispatch(metabotActions.destroyAgent({ agentId: "chat_conv-1" }));

    expect(
      await within(link).findByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();
  });

  it("shows a dot for a conversation with an unread response", async () => {
    setup({
      conversations: CONVERSATIONS,
      activeConversations: {
        "chat_conv-1": {
          title: "Revenue by category",
          isProcessing: false,
          hasUnreadResponse: true,
          visible: false,
          expanded: false,
        },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    expect(
      within(link).getByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();
  });

  it("clears the finished dot when opening the conversation", async () => {
    const { store } = setup({
      conversations: CONVERSATIONS,
      activeConversations: {
        "chat_conv-1": { title: "Revenue by category", isProcessing: true },
      },
    });

    const link = await screen.findByRole("listitem", {
      name: "Revenue by category",
    });
    store.dispatch(
      metabotActions.setIsProcessing({
        agentId: "chat_conv-1",
        processing: false,
      }),
    );
    expect(
      await within(link).findByTestId("metabot-thread-unread-dot"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Revenue by category/ }),
    );

    await waitFor(() => {
      expect(link).toHaveAttribute("aria-selected", "true");
    });
    expect(
      within(link).queryByTestId("metabot-thread-unread-dot"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the user has no Metabot access", () => {
    setup({ metabotEnabled: false });

    expect(
      screen.queryByRole("section", { name: "Metabot" }),
    ).not.toBeInTheDocument();
  });

  it("triggers onItemSelect when opening a thread", async () => {
    const { onItemSelect } = setup();

    await userEvent.click(
      await screen.findByRole("link", { name: /Revenue by category/ }),
    );
    expect(onItemSelect).toHaveBeenCalled();
  });
});
