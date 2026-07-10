import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import type {
  ConversationDetail,
  ConversationFeedback,
  ConversationMessage,
} from "../../types";

import { ConversationDetailPage } from "./ConversationDetailPage";

jest.mock("metabase/admin/ai/MetabotAdminLayout", () => ({
  MetabotAdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));

// The header fires permission-group / tenant fetches irrelevant to these tests.
jest.mock("./ConversationHeader", () => ({
  ConversationHeader: () => null,
}));

const mockUseGetMetabotConversationQuery = jest.fn();
jest.mock("../../api", () => ({
  useGetMetabotConversationQuery: (...args: unknown[]) =>
    mockUseGetMetabotConversationQuery(...args),
}));

type NodeSpec = {
  // `externalId` doubles as the message's `id` (the tree key parents point at)
  // and, for agent messages, its feedback `externalId`. The current-path reply is
  // just the newest sibling, so fixtures list it last rather than flagging it.
  externalId: string;
  parentId: string | null;
  role: "user" | "assistant";
  message: string;
  inFlight?: boolean;
};

// One flat, single-level chat message in the parent-pointer list the backend now
// returns — a normal chat message plus `parent_message_id`.
function node({
  externalId,
  parentId,
  role,
  message,
  inFlight = false,
}: NodeSpec): ConversationMessage {
  const common = { id: externalId, parent_message_id: parentId };
  if (inFlight) {
    return { ...common, role: "agent", type: "turn_in_progress", externalId };
  }
  if (role === "user") {
    return { ...common, role: "user", type: "text", message };
  }
  return { ...common, role: "agent", type: "text", message, externalId };
}

function createConversation(
  messages: ConversationMessage[],
  feedback: ConversationFeedback[] = [],
): ConversationDetail {
  return {
    conversation_id: "convo-1",
    created_at: "2026-01-01T00:00:00Z",
    summary: "A conversation",
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
  mockUseGetMetabotConversationQuery.mockReturnValue({
    data: conversation,
    isLoading: false,
    error: null,
  });
  return renderWithProviders(
    <Route path="/conversations/:convoId" component={ConversationDetailPage} />,
    {
      withRouter: true,
      initialRoute: "/conversations/convo-1",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("ConversationDetailPage attempts", () => {
  it("renders a single-attempt turn with no pager", () => {
    setup(
      createConversation([
        node({ externalId: "u1", parentId: null, role: "user", message: "hi" }),
        node({
          externalId: "a1",
          parentId: "u1",
          role: "assistant",
          message: "only answer",
        }),
      ]),
    );

    expect(screen.getByText("only answer")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous version" }),
    ).not.toBeInTheDocument();
  });

  it("defaults a regenerated turn to the latest attempt and pages between attempts", async () => {
    setup(
      createConversation([
        node({
          externalId: "u1",
          parentId: null,
          role: "user",
          message: "count orders",
        }),
        node({
          externalId: "a1",
          parentId: "u1",
          role: "assistant",
          message: "first try",
        }),
        node({
          externalId: "a2",
          parentId: "u1",
          role: "assistant",
          message: "kept answer",
        }),
      ]),
    );

    // Latest attempt is shown by default; earlier attempt is hidden.
    expect(screen.getByText("kept answer")).toBeInTheDocument();
    expect(screen.queryByText("first try")).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    // At the newest attempt, forward is disabled and back is enabled.
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

    // At the oldest attempt, back is disabled and forward is enabled.
    expect(
      screen.getByRole("button", { name: "Previous version" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next version" })).toBeEnabled();
  });

  it("shows an in-progress row with a reachable pager while a regeneration streams", async () => {
    setup(
      createConversation([
        node({
          externalId: "u1",
          parentId: null,
          role: "user",
          message: "count orders",
        }),
        node({
          externalId: "a1",
          parentId: "u1",
          role: "assistant",
          message: "first try",
        }),
        node({
          externalId: "a2",
          parentId: "u1",
          role: "assistant",
          message: "",
          inFlight: true,
        }),
      ]),
    );

    // The streaming attempt renders an explicit in-progress row (not a blank),
    // and the pager stays visible so prior attempts remain reachable.
    expect(
      screen.getByTestId("metabot-response-in-progress"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Response in progress/)).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.queryByText("first try")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("first try")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-response-in-progress"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("truncates the conversation after a superseded attempt", async () => {
    setup(
      createConversation([
        node({
          externalId: "u1",
          parentId: null,
          role: "user",
          message: "count orders",
        }),
        node({
          externalId: "a1",
          parentId: "u1",
          role: "assistant",
          message: "first try",
        }),
        node({
          externalId: "a2",
          parentId: "u1",
          role: "assistant",
          message: "kept answer",
        }),
        // The next prompt branched off the kept reply (a2).
        node({
          externalId: "u2",
          parentId: "a2",
          role: "user",
          message: "and by month?",
        }),
        node({
          externalId: "b1",
          parentId: "u2",
          role: "assistant",
          message: "monthly answer",
        }),
      ]),
    );

    // The latest branch shows both turns.
    expect(screen.getByText("kept answer")).toBeInTheDocument();
    expect(screen.getByText("monthly answer")).toBeInTheDocument();

    // Going back to the first turn's earlier attempt drops everything after it,
    // since the rest of the conversation followed from the kept response.
    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" }),
    );

    expect(screen.getByText("first try")).toBeInTheDocument();
    expect(screen.queryByText("and by month?")).not.toBeInTheDocument();
    expect(screen.queryByText("monthly answer")).not.toBeInTheDocument();
  });

  it("does not let admins submit feedback ratings from the transcript", () => {
    setup(
      createConversation([
        node({ externalId: "u1", parentId: null, role: "user", message: "hi" }),
        node({
          externalId: "a1",
          parentId: "u1",
          role: "assistant",
          message: "an answer",
        }),
      ]),
    );

    // The transcript is read-only for admins — no rating controls at all.
    expect(
      screen.queryByTestId("metabot-chat-message-thumbs-up"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-chat-message-thumbs-down"),
    ).not.toBeInTheDocument();
  });

  it("resolves feedback left on a regenerated-away attempt", () => {
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
          node({
            externalId: "u1",
            parentId: null,
            role: "user",
            message: "count orders",
          }),
          node({
            externalId: "a1",
            parentId: "u1",
            role: "assistant",
            message: "discarded answer",
          }),
          node({
            externalId: "a2",
            parentId: "u1",
            role: "assistant",
            message: "kept answer",
          }),
        ],
        [feedback],
      ),
    );

    // The transcript defaults to the kept answer, so the discarded response only
    // appears because the feedback card resolved it via the discarded attempt's id.
    expect(screen.getByText("discarded answer")).toBeInTheDocument();
  });
});
