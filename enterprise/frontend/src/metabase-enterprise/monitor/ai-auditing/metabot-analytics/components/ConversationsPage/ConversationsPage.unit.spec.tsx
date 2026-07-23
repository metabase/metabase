import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route, withRouteProps } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ConversationSummary,
  ConversationsResponse,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";
import { createMockUser } from "metabase-types/api/mocks";

import { ConversationsPage } from "./ConversationsPage";

const RoutedConversationsPage = withRouteProps(ConversationsPage);

function createConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    conversation_id: "convo-1",
    created_at: "2026-01-15T00:00:00Z",
    user_id: 1,
    title: null,
    message_count: 4,
    user_message_count: 2,
    assistant_message_count: 2,
    total_tokens: 12345,
    cache_read_tokens: 6789,
    last_message_at: "2026-01-15T00:05:00Z",
    profile_id: null,
    search_count: 1,
    query_count: 2,
    ip_address: "10.0.0.1",
    embedding_hostname: null,
    embedding_path: null,
    user_agent: null,
    sanitized_user_agent: null,
    user: { id: 1, first_name: "Ada", last_name: "Lovelace", tenant_id: null },
    ...overrides,
  };
}

function setupEndpoints(conversations: ConversationSummary[]) {
  const response: ConversationsResponse = {
    data: conversations,
    total: conversations.length,
    limit: 25,
    offset: 0,
  };
  fetchMock.get("path:/api/ee/metabot-analytics/conversations", response);
  setupUsersEndpoints([createMockUser({ id: 1, first_name: "Ada" })]);
  setupGroupsEndpoint([]);
}

function setup({
  conversations = [createConversation()],
}: { conversations?: ConversationSummary[] } = {}) {
  // TreeTable measures column/row sizes via the DOM; jsdom needs a stubbed rect
  // for its virtualized rows to render. A wide viewport keeps every column
  // (there are nine) within the horizontal virtualizer's rendered range.
  mockGetBoundingClientRect({ width: 2000, height: 100 });
  setupEnterprisePlugins();
  setupEndpoints(conversations);

  return renderWithProviders(
    <Route path="/monitor/ai-auditing">
      <Route path="conversations" element={<RoutedConversationsPage />} />
      <Route
        path="conversations/:conversationId"
        element={<div>Conversation detail page</div>}
      />
    </Route>,
    {
      initialRoute: "/monitor/ai-auditing/conversations",
      withRouter: true,
      storeInitialState: createMockState({}),
    },
  );
}

describe("ConversationsPage", () => {
  it("renders the conversations table with its columns", async () => {
    setup();

    const table = await screen.findByRole("treegrid", {
      name: "Conversations",
    });
    expect(table).toBeInTheDocument();

    // Sortable columns render with the "columnheader" role; Queries and Searches
    // aren't sortable, so they're asserted via plain text below instead.
    const sortableColumnHeaders = [
      "Title",
      "User",
      "Profile",
      "Date",
      "Messages",
      "Tokens",
      "Cached tokens",
      "IP",
    ];
    for (const name of sortableColumnHeaders) {
      expect(
        within(table).getByRole("columnheader", {
          name: new RegExp(`^${name}\\b`),
        }),
      ).toBeInTheDocument();
    }
    expect(within(table).getByText("Queries")).toBeInTheDocument();
    expect(within(table).getByText("Searches")).toBeInTheDocument();
  });

  it("renders a conversation row with formatted cell values", async () => {
    setup({
      conversations: [
        createConversation({
          message_count: 4,
          total_tokens: 12345,
          cache_read_tokens: 6789,
        }),
      ],
    });

    await screen.findByRole("treegrid", { name: "Conversations" });

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("6,789")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    // profile_id is null in the mock, so the Profile cell renders the empty placeholder
    // rather than a blank cell.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("navigates to the conversation detail page when a row is clicked", async () => {
    const { history } = setup({
      conversations: [createConversation({ conversation_id: "convo-42" })],
    });

    await screen.findByRole("treegrid", { name: "Conversations" });
    const row = await screen.findByTestId("conversation");
    await userEvent.click(row);

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorAiAuditingConversationDetail("convo-42"),
    );
  });

  function wasSortedBy(sortBy: string, sortDir: string) {
    return fetchMock.callHistory
      .calls("path:/api/ee/metabot-analytics/conversations")
      .some((call) => {
        const url = new URL(
          call.request?.url ?? call.url ?? "",
          "http://localhost",
        );
        return (
          url.searchParams.get("sort_by") === sortBy &&
          url.searchParams.get("sort_dir") === sortDir
        );
      });
  }

  it("sorts the table server-side when a sortable column header is clicked", async () => {
    setup();

    await screen.findByRole("treegrid", { name: "Conversations" });
    await userEvent.click(
      await screen.findByRole("columnheader", { name: /^Messages\b/ }),
    );

    await waitFor(() => {
      expect(wasSortedBy("message_count", "asc")).toBe(true);
    });
  });

  it("sorts server-side via the custom Cached tokens header", async () => {
    setup();

    await screen.findByRole("treegrid", { name: "Conversations" });
    // The Cached tokens header is a custom node (Tooltip + SortableHeaderPill), not a plain
    // string header, so assert its columnheader still drives server-side sorting.
    await userEvent.click(
      await screen.findByRole("columnheader", { name: /^Cached tokens\b/ }),
    );

    await waitFor(() => {
      expect(wasSortedBy("cache_read_tokens", "asc")).toBe(true);
    });
  });

  it("renders the empty state when there are no conversations", async () => {
    setup({ conversations: [] });

    expect(
      await screen.findByText("No conversations found"),
    ).toBeInTheDocument();
  });
});
