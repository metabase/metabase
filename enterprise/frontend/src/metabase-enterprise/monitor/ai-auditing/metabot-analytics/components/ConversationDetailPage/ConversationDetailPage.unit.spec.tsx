import userEvent from "@testing-library/user-event";

import {
  createMockMetabotTextPart,
  createMockMetabotToolCallPart,
  createMockParentedMessage,
  setupGroupsEndpoint,
  setupMetabotConversationEndpoint,
  setupMetabotConversationEndpointError,
  setupMetabotConversationRawEndpoint,
  setupPermissionMembershipEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { openSaveDialog } from "metabase/utils/dom";
import { defer } from "metabase/utils/promise";
import type {
  ConversationDetail,
  ConversationFeedback,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";
import type {
  GroupListQuery,
  ListUserMembershipsResponse,
} from "metabase-types/api";
import {
  createMockGroup,
  createMockUser,
  createMockVersion,
} from "metabase-types/api/mocks";

import { ConversationDetailPage } from "./ConversationDetailPage";

jest.mock("metabase/monitor/components/MonitorLayout", () => ({
  MonitorMain: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

jest.mock("metabase/monitor/components/MonitorLayout/Sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => children,
}));

type ConversationMessage = ConversationDetail["messages"][number];
type AgentMessagePart = Extract<
  ConversationMessage["parts"][number],
  { role: "agent" }
>;

function userMessage(
  id: string,
  parentId: string | null,
  text: string,
): ConversationMessage {
  return createMockParentedMessage(id, parentId, {
    role: "user",
    parts: [{ id: `${id}-text`, role: "user", type: "text", message: text }],
  });
}

function agentMessage(
  id: string,
  parentId: string,
  ...parts: (string | AgentMessagePart)[]
): ConversationMessage {
  return createMockParentedMessage(id, parentId, {
    externalId: id,
    parts: parts.map((part, index) =>
      typeof part === "string"
        ? createMockMetabotTextPart({
            id: `${id}-text-${index}`,
            message: part,
          })
        : part,
    ),
  });
}

function inProgressMessage(id: string, parentId: string): ConversationMessage {
  return createMockParentedMessage(id, parentId, {
    externalId: id,
    status: { type: "in_progress" },
  });
}

function toolCallPart(id: string): AgentMessagePart {
  return createMockMetabotToolCallPart({
    id: `${id}-tool-call`,
    args: JSON.stringify({ query: "orders" }),
    result: JSON.stringify({ count: 3 }),
  });
}

function createConversation(
  messages: ConversationMessage[],
  feedback: ConversationFeedback[] = [],
): ConversationDetail {
  return {
    conversation_id: "convo-1",
    created_at: "2026-01-01T00:00:00Z",
    title: "A conversation",
    user: null,
    message_count: 2,
    total_tokens: 30,
    profile_id: "internal",
    slack_permalink: null,
    messages,
    queries: [],
    search_count: 0,
    query_count: 0,
    ip_address: null,
    embedding_hostname: null,
    embedding_path: null,
    user_agent: null,
    sanitized_user_agent: null,
    forked_from_conversation_id: null,
    fork_boundary_message_id: null,
    feedback,
  };
}

interface SetupOpts {
  conversation: ConversationDetail;
  /** The detail endpoint's exact response text, when it holds JSON that `conversation` can't */
  conversationResponseText?: string;
  groups?: GroupListQuery[];
  memberships?: ListUserMembershipsResponse;
}

function setup({
  conversation,
  conversationResponseText,
  groups = [],
  memberships = {},
}: SetupOpts) {
  if (conversationResponseText != null) {
    setupMetabotConversationRawEndpoint(
      conversation.conversation_id,
      conversationResponseText,
    );
  } else {
    setupMetabotConversationEndpoint(conversation);
  }
  setupGroupsEndpoint(groups);
  setupPermissionMembershipEndpoint(memberships);
  return renderWithProviders(
    <Route
      path="/conversations/:convoId"
      element={<ConversationDetailPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/conversations/convo-1",
      withUndos: true,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          version: createMockVersion({ tag: "v1.58.0" }),
        }),
      },
    },
  );
}

describe("ConversationDetailPage", () => {
  it("shows the conversation title in the header", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "hi"),
        agentMessage("a1", "u1", "an answer"),
      ]),
    });

    expect(
      await screen.findByRole("heading", { name: "A conversation" }),
    ).toBeInTheDocument();
  });

  it("marks the fork boundary and links to the original conversation", async () => {
    setupMetabotConversationEndpoint({
      ...createConversation([]),
      conversation_id: "convo-0",
      title: "Original chat",
    });
    setup({
      conversation: {
        ...createConversation([
          userMessage("u1", null, "hi"),
          agentMessage("a1", "u1", "inherited answer"),
          userMessage("u2", "a1", "follow up"),
          agentMessage("a2", "u2", "new answer"),
        ]),
        forked_from_conversation_id: "convo-0",
        fork_boundary_message_id: "a1",
      },
    });

    expect(await screen.findByText("inherited answer")).toBeInTheDocument();
    const forkBoundary = screen.getByTestId("metabot-fork-boundary");
    expect(forkBoundary).toBeInTheDocument();

    const forkBoundaryLink = within(forkBoundary).getByRole("link", {
      name: "a previous conversation",
    });
    expect(forkBoundaryLink).toHaveAttribute(
      "href",
      Urls.monitorAiAuditingConversationDetail("convo-0"),
    );

    const forkedLink = await screen.findByRole("link", {
      name: "Forked from Original chat",
    });
    expect(forkedLink).toHaveAttribute(
      "href",
      Urls.monitorAiAuditingConversationDetail("convo-0"),
    );
  });

  it("shows the fork boundary only on the inherited attempt of a regenerated boundary turn", async () => {
    setupMetabotConversationEndpoint({
      ...createConversation([]),
      conversation_id: "convo-0",
      title: "Original chat",
    });
    setup({
      conversation: {
        ...createConversation([
          userMessage("u1", null, "count orders"),
          agentMessage("a1", "u1", "inherited answer"),
          agentMessage("a2", "u1", "regenerated answer"),
        ]),
        forked_from_conversation_id: "convo-0",
        fork_boundary_message_id: "a1",
      },
    });

    expect(await screen.findByText("regenerated answer")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-fork-boundary"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("inherited answer")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-fork-boundary")).toBeInTheDocument();
  });

  it("does not render a fork boundary for a non-forked conversation", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "hi"),
        agentMessage("a1", "u1", "an answer"),
      ]),
    });

    expect(await screen.findByText("an answer")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-fork-boundary"),
    ).not.toBeInTheDocument();
  });

  it("defaults a regenerated turn to the latest attempt and pages between attempts", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        agentMessage("a2", "u1", "kept answer"),
      ]),
    });

    expect(await screen.findByText("kept answer")).toBeInTheDocument();
    expect(screen.queryByText("first try")).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next version" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previous version" }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("first try")).toBeInTheDocument();
    expect(screen.queryByText("kept answer")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous version" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next version" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next version" }));

    expect(screen.getByText("kept answer")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("shows the loading state with a reachable pager while a regeneration streams", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        inProgressMessage("a2", "u1"),
      ]),
    });

    expect(
      await screen.findByTestId("metabot-response-loader"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.queryByText("first try")).not.toBeInTheDocument();
    const [, inProgressElement] = screen.getAllByTestId("metabot-chat-message");
    expect(
      within(inProgressElement).queryByTestId("metabot-chat-message-copy"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("first try")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-response-loader"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("truncates the conversation after a superseded attempt", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        agentMessage("a2", "u1", "kept answer"),
        userMessage("u2", "a2", "and by month?"),
        agentMessage("b1", "u2", "monthly answer"),
      ]),
    });

    expect(await screen.findByText("kept answer")).toBeInTheDocument();
    expect(screen.getByText("monthly answer")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("first try")).toBeInTheDocument();
    expect(screen.queryByText("and by month?")).not.toBeInTheDocument();
    expect(screen.queryByText("monthly answer")).not.toBeInTheDocument();
  });

  it("does not let admins submit feedback ratings from the transcript", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "hi"),
        agentMessage("a1", "u1", "an answer"),
      ]),
    });

    expect(await screen.findByText("an answer")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-chat-message-thumbs-up"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-chat-message-thumbs-down"),
    ).not.toBeInTheDocument();
  });

  it("resolves feedback left on a regenerated-away attempt", async () => {
    const feedback: ConversationFeedback = {
      id: 1,
      message_id: "10",
      user_id: 1,
      external_id: "a1",
      positive: false,
      issue_type: "not-factual",
      freeform_feedback: "wrong table",
    };
    setup({
      conversation: createConversation(
        [
          userMessage("u1", null, "count orders"),
          agentMessage("a1", "u1", "discarded answer"),
          agentMessage("a2", "u1", "kept answer"),
        ],
        [feedback],
      ),
    });

    expect(await screen.findByText("discarded answer")).toBeInTheDocument();
  });

  it("shows tool call details in a sidebar, and closes it", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "search orders"),
        agentMessage("a1", "u1", toolCallPart("a1"), "found 3 orders"),
      ]),
    });

    expect(await screen.findByText("search")).toBeInTheDocument();
    expect(
      screen.queryByTestId("tool-call-details-sidebar"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("search"));

    const sidebar = await screen.findByTestId("tool-call-details-sidebar");
    expect(within(sidebar).getByText("Tool Call")).toBeInTheDocument();
    expect(within(sidebar).getAllByText("search")).not.toHaveLength(0);

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Close" }),
    );

    expect(
      screen.queryByTestId("tool-call-details-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("closes the sidebar when the same tool call is clicked again", async () => {
    setup({
      conversation: createConversation([
        userMessage("u1", null, "search orders"),
        agentMessage("a1", "u1", toolCallPart("a1"), "found 3 orders"),
      ]),
    });

    await screen.findByText("search");
    const toolCallRow = screen.getAllByTestId("metabot-chat-message")[1];

    await userEvent.click(within(toolCallRow).getByText("search"));
    expect(
      await screen.findByTestId("tool-call-details-sidebar"),
    ).toBeInTheDocument();

    await userEvent.click(within(toolCallRow).getByText("search"));

    expect(
      screen.queryByTestId("tool-call-details-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("links each of the user's groups to the usage page filtered by that group", async () => {
    const group = createMockGroup({
      id: 42,
      name: "Analysts",
      magic_group_type: null,
    });
    setup({
      conversation: {
        ...createConversation([userMessage("u1", null, "hi")]),
        user: {
          id: 7,
          first_name: "Ada",
          last_name: "Lovelace",
          tenant_id: null,
        },
      },
      groups: [group],
      memberships: {
        7: [{ user_id: 7, group_id: group.id, membership_id: 1 }],
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Analysts/ }),
    );

    expect(screen.getByText("View a group's usage")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Analysts/ })).toHaveAttribute(
      "href",
      Urls.monitorAiAuditingUsage({ groupId: 42 }),
    );
  });

  describe("JSON download", () => {
    const CONVERSATION = createConversation([
      userMessage("u1", null, "count orders"),
      agentMessage("a1", "u1", "an answer"),
    ]);
    const DOWNLOAD_BUTTON = { name: "Download JSON" };

    beforeEach(() => {
      jest.mocked(openSaveDialog).mockClear();
    });

    // jsdom's Blob has no .text()
    function readBlobText(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
    }

    async function waitForDownloadToFinish(button: HTMLElement) {
      await waitFor(() => {
        expect(button).not.toHaveAttribute("data-loading");
      });
      expect(button).toBeEnabled();
    }

    function lastSavedFile() {
      const lastCall = jest.mocked(openSaveDialog).mock.lastCall;
      if (!lastCall) {
        throw new Error("Nothing was downloaded");
      }
      const [fileName, blob] = lastCall;
      return { fileName, blob };
    }

    it("offers a JSON download of the conversation", async () => {
      setup({ conversation: CONVERSATION });

      expect(
        await screen.findByRole("button", DOWNLOAD_BUTTON),
      ).toBeInTheDocument();
    });

    it("downloads the conversation exactly as the API sent it, in a versioned JSON envelope", async () => {
      // As the backend writes it: Cheshire spells doubles 45.0 and
      // 1.23456789E7, and JSON.parse would round 9007199254740993.
      const responseText = JSON.stringify({
        ...CONVERSATION,
        total_tokens: 1,
      }).replace(
        '"total_tokens":1',
        '"total_tokens":9007199254740993,"cost":45.0,"rows":1.23456789E7',
      );
      setup({
        conversation: CONVERSATION,
        conversationResponseText: responseText,
      });

      const button = await screen.findByRole("button", DOWNLOAD_BUTTON);
      await userEvent.click(button);

      await waitForDownloadToFinish(button);
      expect(openSaveDialog).toHaveBeenCalledTimes(1);
      const { fileName, blob } = lastSavedFile();
      expect(fileName).toBe("metabot-conversation-convo-1.json");
      expect(blob.type).toBe("application/json");
      const text = await readBlobText(blob);
      expect(text).toMatch(
        /^\{"format":"metabase\.metabot-conversation","version":1,"description":"(?:[^"\\]|\\.)+","exported_at":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","metabase_version":"v1\.58\.0","conversation":/,
      );
      expect(text.endsWith(`"conversation":${responseText}}`)).toBe(true);
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("shows that it is loading and ignores clicks until the download is ready", async () => {
      setup({ conversation: CONVERSATION });
      const button = await screen.findByRole("button", DOWNLOAD_BUTTON);
      const response = defer<string>();
      setupMetabotConversationRawEndpoint(
        CONVERSATION.conversation_id,
        response.promise,
      );

      await userEvent.click(button);
      await waitFor(() => {
        expect(button).toHaveAttribute("data-loading", "true");
      });
      expect(button).toBeDisabled();
      await userEvent.click(button, { pointerEventsCheck: 0 });
      response.resolve(JSON.stringify(CONVERSATION));

      await waitForDownloadToFinish(button);
      expect(openSaveDialog).toHaveBeenCalledTimes(1);
    });

    it("shows an error toast and saves nothing when the conversation cannot be fetched", async () => {
      setup({ conversation: CONVERSATION });
      const button = await screen.findByRole("button", DOWNLOAD_BUTTON);
      setupMetabotConversationEndpointError(CONVERSATION.conversation_id);

      await userEvent.click(button);

      expect(
        await screen.findByText("Couldn't export the conversation"),
      ).toBeInTheDocument();
      await waitForDownloadToFinish(button);
      expect(openSaveDialog).not.toHaveBeenCalled();
    });
  });
});
