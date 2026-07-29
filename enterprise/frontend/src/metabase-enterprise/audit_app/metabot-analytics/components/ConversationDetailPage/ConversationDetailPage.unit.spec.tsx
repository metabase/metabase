import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupMetabotConversationEndpoint,
  setupPermissionMembershipEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route, withRouteProps } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import type { ConversationDetail, ConversationFeedback } from "../../types";

import { ConversationDetailPage } from "./ConversationDetailPage";

const RoutedConversationDetailPage = withRouteProps(ConversationDetailPage);

jest.mock("metabase/admin/ai/MetabotAdminLayout", () => ({
  MetabotAdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));

type ConversationMessage = ConversationDetail["messages"][number];

function userMessage(
  id: string,
  parentId: string | null,
  message: string,
): ConversationMessage {
  return {
    id,
    parent_message_id: parentId,
    role: "user",
    type: "text",
    message,
  };
}

function agentMessage(
  id: string,
  parentId: string,
  message: string,
): ConversationMessage {
  return {
    id,
    parent_message_id: parentId,
    role: "agent",
    type: "text",
    message,
    externalId: id,
  };
}

function inProgressMessage(id: string, parentId: string): ConversationMessage {
  return {
    id,
    parent_message_id: parentId,
    role: "agent",
    type: "turn_in_progress",
    externalId: id,
  };
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
    feedback,
  };
}

function setup(conversation: ConversationDetail) {
  setupMetabotConversationEndpoint(conversation);
  setupGroupsEndpoint([]);
  setupPermissionMembershipEndpoint({});
  return renderWithProviders(
    <Route
      path="/conversations/:convoId"
      element={<RoutedConversationDetailPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/conversations/convo-1",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("ConversationDetailPage", () => {
  it("shows the conversation title in the header", async () => {
    setup(
      createConversation([
        userMessage("u1", null, "hi"),
        agentMessage("a1", "u1", "an answer"),
      ]),
    );

    expect(
      await screen.findByRole("heading", { name: "A conversation" }),
    ).toBeInTheDocument();
  });

  it("defaults a regenerated turn to the latest attempt and pages between attempts", async () => {
    setup(
      createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        agentMessage("a2", "u1", "kept answer"),
      ]),
    );

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
    setup(
      createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        inProgressMessage("a2", "u1"),
      ]),
    );

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
    setup(
      createConversation([
        userMessage("u1", null, "count orders"),
        agentMessage("a1", "u1", "first try"),
        agentMessage("a2", "u1", "kept answer"),
        userMessage("u2", "a2", "and by month?"),
        agentMessage("b1", "u2", "monthly answer"),
      ]),
    );

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
    setup(
      createConversation([
        userMessage("u1", null, "hi"),
        agentMessage("a1", "u1", "an answer"),
      ]),
    );

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
      metabot_id: 1,
      message_id: "10",
      user_id: 1,
      external_id: "a1",
      positive: false,
      issue_type: "not-factual",
      freeform_feedback: "wrong table",
    };
    setup(
      createConversation(
        [
          userMessage("u1", null, "count orders"),
          agentMessage("a1", "u1", "discarded answer"),
          agentMessage("a2", "u1", "kept answer"),
        ],
        [feedback],
      ),
    );

    expect(await screen.findByText("discarded answer")).toBeInTheDocument();
  });
});
