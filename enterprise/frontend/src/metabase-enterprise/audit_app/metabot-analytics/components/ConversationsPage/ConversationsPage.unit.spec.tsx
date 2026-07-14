import {
  setupGroupsEndpoint,
  setupListMetabotAnalyticsConversationsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import type { ConversationSummary } from "../../types";

import { ConversationsPage } from "./ConversationsPage";

jest.mock("metabase/admin/ai/MetabotAdminLayout", () => ({
  MetabotAdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));

function createSummary(
  opts: Partial<ConversationSummary> &
    Pick<ConversationSummary, "conversation_id">,
): ConversationSummary {
  return {
    created_at: "2026-01-01T00:00:00Z",
    user_id: 1,
    title: null,
    message_count: 0,
    user_message_count: 0,
    assistant_message_count: 0,
    total_tokens: 0,
    cache_read_tokens: 0,
    last_message_at: null,
    profile_id: null,
    search_count: 0,
    query_count: 0,
    ip_address: null,
    embedding_hostname: null,
    embedding_path: null,
    user_agent: null,
    sanitized_user_agent: null,
    user: null,
    ...opts,
  };
}

function setup(conversations: ConversationSummary[]) {
  setupListMetabotAnalyticsConversationsEndpoint(conversations);
  setupUsersEndpoints([]);
  setupGroupsEndpoint([]);
  return renderWithProviders(
    <Route path="/conversations" component={ConversationsPage} />,
    {
      withRouter: true,
      initialRoute: "/conversations",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("ConversationsPage", () => {
  it("surfaces conversation titles in the table, falling back to Untitled", async () => {
    setup([
      createSummary({ conversation_id: "c1", title: "How many orders?" }),
      createSummary({ conversation_id: "c2", title: null }),
    ]);

    expect(await screen.findByText("How many orders?")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Title" }),
    ).toBeInTheDocument();

    const [, titledRow, untitledRow] = screen.getAllByRole("row");
    expect(within(titledRow).getAllByRole("cell")[0]).toHaveTextContent(
      "How many orders?",
    );
    expect(within(untitledRow).getAllByRole("cell")[0]).toHaveTextContent(
      "Untitled",
    );
  });
});
