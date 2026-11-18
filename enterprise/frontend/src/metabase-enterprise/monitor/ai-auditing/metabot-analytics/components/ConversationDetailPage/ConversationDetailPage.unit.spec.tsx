import userEvent from "@testing-library/user-event";

import {
  createMockMetabotTextPart,
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

import {
  createMockConversationDetail,
  createMockSucceededToolCall,
} from "../../tests/fixtures";
import * as Transcript from "../../utils/transcript";

import { ConversationDetailPage } from "./ConversationDetailPage";

jest.mock("metabase/monitor/components/MonitorLayout", () => ({
  MonitorMain: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

jest.mock("../../utils/transcript", () => {
  const actual = jest.requireActual<typeof Transcript>(
    "../../utils/transcript",
  );
  return {
    ...actual,
    conversationToMarkdown: jest.fn(actual.conversationToMarkdown),
  };
});

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
  return createMockSucceededToolCall({
    id: `${id}-tool-call`,
    name: "search",
    args: JSON.stringify({ query: "orders" }),
    output: { output: "Found 3 orders", structured_output: { count: 3 } },
  });
}

function createConversation(
  messages: ConversationMessage[],
  feedback: ConversationFeedback[] = [],
): ConversationDetail {
  return createMockConversationDetail({ messages, feedback });
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

  describe("export", () => {
    const BRANCHED_CONVERSATION = createConversation([
      userMessage("u1", null, "count orders"),
      agentMessage("a1", "u1", "first try"),
      agentMessage("a2", "u1", "kept answer", toolCallPart("a2")),
    ]);

    beforeEach(() => {
      jest.mocked(navigator.clipboard.writeText).mockClear();
      jest.mocked(openSaveDialog).mockClear();
    });

    async function chooseExportItem(name: string) {
      await userEvent.click(
        await screen.findByRole("button", { name: "Export" }),
      );
      await userEvent.click(await screen.findByRole("menuitem", { name }));
    }

    // jsdom's Blob has no .text()
    function readBlobText(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
    }

    function lastSavedFile() {
      const lastCall = jest.mocked(openSaveDialog).mock.lastCall;
      if (!lastCall) {
        throw new Error("Nothing was downloaded");
      }
      const [fileName, blob] = lastCall;
      return { fileName, blob };
    }

    it("offers to copy or download the transcript", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await userEvent.click(
        await screen.findByRole("button", { name: "Export" }),
      );

      expect(
        await screen.findByRole("menuitem", { name: "Copy as Markdown" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Download Markdown" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Download JSON" }),
      ).toBeInTheDocument();
    });

    it("returns focus to the Export button after an item is chosen", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Download Markdown");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Export" })).toHaveFocus(),
      );
    });

    it("copies the Markdown transcript and confirms with a toast", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Copy as Markdown");

      expect(
        await screen.findByText("Copied the conversation as Markdown"),
      ).toBeInTheDocument();
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
      const [copied] = jest.mocked(navigator.clipboard.writeText).mock.calls[0];
      expect(copied).toMatch(/^# A conversation\n/);
      expect(copied).toContain("kept answer");
      expect(copied).toContain("#### Tool call: `search`");
      expect(copied).not.toContain("first try");
    });

    it("confirms every copy, including one right after another", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Copy as Markdown");
      expect(
        await screen.findByText("Copied the conversation as Markdown"),
      ).toBeInTheDocument();

      await chooseExportItem("Copy as Markdown");

      await waitFor(() =>
        expect(
          screen.getAllByText("Copied the conversation as Markdown"),
        ).toHaveLength(2),
      );
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    });

    it("copies the branch on screen after switching to another attempt", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await userEvent.click(
        await screen.findByRole("button", { name: "Previous version" }),
      );
      await chooseExportItem("Copy as Markdown");

      expect(
        await screen.findByText("Copied the conversation as Markdown"),
      ).toBeInTheDocument();
      const [copied] = jest.mocked(navigator.clipboard.writeText).mock.calls[0];
      expect(copied).toContain("first try");
      expect(copied).not.toContain("kept answer");
    });

    it("exports Slack messages as they are shown, converted to Markdown", async () => {
      setup({
        conversation: {
          ...createConversation([
            userMessage("u1", null, "where are the docs?"),
            agentMessage("a1", "u1", "See <https://example.com|the docs>"),
          ]),
          profile_id: "slackbot",
        },
      });

      await chooseExportItem("Copy as Markdown");

      expect(
        await screen.findByText("Copied the conversation as Markdown"),
      ).toBeInTheDocument();
      const [copied] = jest.mocked(navigator.clipboard.writeText).mock.calls[0];
      expect(copied).toContain("See [the docs](https://example.com)");
    });

    it("shows an error toast when the clipboard refuses the copy", async () => {
      jest
        .mocked(navigator.clipboard.writeText)
        .mockRejectedValueOnce(new Error("Denied"));
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Copy as Markdown");

      expect(
        await screen.findByText("Couldn't copy the conversation"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Copied the conversation as Markdown"),
      ).not.toBeInTheDocument();
    });

    it("shows an error toast when the transcript cannot be built", async () => {
      jest
        .mocked(Transcript.conversationToMarkdown)
        .mockImplementationOnce(() => {
          throw new Error("Unexpected data");
        });
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Download Markdown");

      expect(
        await screen.findByText("Couldn't export the conversation"),
      ).toBeInTheDocument();
      expect(openSaveDialog).not.toHaveBeenCalled();
    });

    it("downloads the Markdown transcript", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });

      await chooseExportItem("Download Markdown");

      expect(openSaveDialog).toHaveBeenCalledTimes(1);
      const { fileName, blob } = lastSavedFile();
      expect(fileName).toBe("metabot-conversation-convo-1.md");
      expect(blob.type).toBe("text/markdown");
      const text = await readBlobText(blob);
      expect(text).toMatch(/^# A conversation\n/);
      expect(text).toContain("kept answer");
    });

    it("downloads the conversation exactly as the API sent it, in a versioned JSON envelope", async () => {
      const responseText = JSON.stringify({
        ...BRANCHED_CONVERSATION,
        total_tokens: 1,
      }).replace('"total_tokens":1', '"total_tokens":9007199254740993');
      setup({
        conversation: BRANCHED_CONVERSATION,
        conversationResponseText: responseText,
      });

      await chooseExportItem("Download JSON");

      await waitFor(() => expect(openSaveDialog).toHaveBeenCalledTimes(1));
      const { fileName, blob } = lastSavedFile();
      expect(fileName).toBe("metabot-conversation-convo-1.json");
      expect(blob.type).toBe("application/json");
      const text = await readBlobText(blob);
      expect(text).toMatch(
        /^\{"format":"metabase\.metabot-conversation","version":1,"exported_at":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","metabase_version":"v1\.58\.0","conversation":/,
      );
      expect(text.endsWith(`"conversation":${responseText}}`)).toBe(true);
    });

    it("shows an error toast when the conversation cannot be fetched for the JSON download", async () => {
      setup({ conversation: BRANCHED_CONVERSATION });
      expect(
        await screen.findByRole("button", { name: "Export" }),
      ).toBeInTheDocument();
      setupMetabotConversationEndpointError(
        BRANCHED_CONVERSATION.conversation_id,
      );

      await chooseExportItem("Download JSON");

      expect(
        await screen.findByText("Couldn't export the conversation"),
      ).toBeInTheDocument();
      expect(openSaveDialog).not.toHaveBeenCalled();
    });
  });
});
