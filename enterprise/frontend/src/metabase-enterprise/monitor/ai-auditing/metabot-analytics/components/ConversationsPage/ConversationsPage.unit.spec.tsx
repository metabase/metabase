import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupListMetabotAnalyticsConversationsEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import {
  ALL_USERS_GROUP,
  BOBBY,
  BOBBY_TENANT,
  DATA_GROUP,
  ROBERT,
  ROBERT_TENANT,
  selectFilterOption,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/tests/fixtures";
import type { ConversationSummary } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ConversationsPage } from "./ConversationsPage";

const CONVERSATIONS_PATH = Urls.monitorAiAuditingConversations();
const CONVERSATIONS_ENDPOINT = "path:/api/ee/metabot-analytics/conversations";

function createSummary(
  opts: Partial<ConversationSummary> &
    Pick<ConversationSummary, "conversation_id">,
): ConversationSummary {
  return {
    created_at: "2026-01-15T00:00:00Z",
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
    forked_from_conversation_id: null,
    user: null,
    ...opts,
  };
}

const BOBBY_CONVERSATION = createSummary({
  conversation_id: "c1",
  title: "How many orders?",
  profile_id: "nlq",
  ip_address: "10.0.0.1",
  message_count: 4,
  total_tokens: 12345,
  cache_read_tokens: 6789,
  user: {
    id: BOBBY.id,
    first_name: BOBBY.first_name,
    last_name: BOBBY.last_name,
    tenant_id: BOBBY_TENANT.id,
  },
});

const ROBERT_CONVERSATION = createSummary({
  conversation_id: "c2",
  title: null,
  profile_id: "sql",
  ip_address: "10.0.0.3",
  user: {
    id: ROBERT.id,
    first_name: ROBERT.first_name,
    last_name: ROBERT.last_name,
    tenant_id: ROBERT_TENANT.id,
  },
});

type SetupOpts = {
  conversations?: ConversationSummary[];
  total?: number;
  initialRoute?: string;
  hasTenants?: boolean;
};

function setup({
  conversations = [BOBBY_CONVERSATION, ROBERT_CONVERSATION],
  total,
  initialRoute = CONVERSATIONS_PATH,
  hasTenants = false,
}: SetupOpts = {}) {
  // TreeTable measures column/row sizes via the DOM; jsdom needs a stubbed rect
  // for its virtualized rows to render.
  mockGetBoundingClientRect({ width: 2000, height: 100 });
  setupEnterprisePlugins();
  setupListMetabotAnalyticsConversationsEndpoint(conversations, total);
  setupUsersEndpoints([BOBBY, ROBERT]);
  setupGroupsEndpoint([ALL_USERS_GROUP, DATA_GROUP]);
  setupTenantEntpoints([BOBBY_TENANT, ROBERT_TENANT]);

  return renderWithProviders(
    <>
      <Route path={CONVERSATIONS_PATH} element={<ConversationsPage />} />
      <Route
        path={`${CONVERSATIONS_PATH}/:conversationId`}
        element={<div data-testid="conversation-detail-page" />}
      />
    </>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            audit_app: true,
            tenants: hasTenants,
          }),
          "use-tenants": hasTenants,
        }),
      }),
    },
  );
}

async function assertRequestedWithParams(
  expected: Record<string, string>,
): Promise<void> {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.called(CONVERSATIONS_ENDPOINT, { query: expected }),
    ).toBe(true);
  });
}

function findTable() {
  return screen.findByRole("treegrid", { name: "Conversations" });
}

describe("ConversationsPage", () => {
  describe("table", () => {
    it("renders the title, user, profile label and IP address of each conversation", async () => {
      setup();

      const table = await findTable();

      const columnHeaders = [
        "Title",
        "User",
        "Profile",
        "Date",
        "Messages",
        "Tokens",
        "Cached tokens",
        "Queries",
        "Searches",
        "IP",
      ];
      for (const name of columnHeaders) {
        expect(
          within(table).getByRole("columnheader", {
            name: new RegExp(`^${name}\\b`),
          }),
        ).toBeInTheDocument();
      }

      expect(within(table).getByText("How many orders?")).toBeInTheDocument();
      expect(within(table).getByText("Untitled")).toBeInTheDocument();
      expect(within(table).getByText("Bobby Tables")).toBeInTheDocument();
      expect(within(table).getByText("NLQ")).toBeInTheDocument();
      expect(within(table).getByText("10.0.0.1")).toBeInTheDocument();
      expect(within(table).getByText("Robert Tableton")).toBeInTheDocument();
      expect(within(table).getByText("SQL")).toBeInTheDocument();
      expect(within(table).getByText("10.0.0.3")).toBeInTheDocument();
    });

    it("formats the numeric cells", async () => {
      const table = (setup(), await findTable());

      expect(within(table).getByText("4")).toBeInTheDocument();
      expect(within(table).getByText("12,345")).toBeInTheDocument();
      expect(within(table).getByText("6,789")).toBeInTheDocument();
    });

    it("shows an empty state when no conversations match", async () => {
      setup({ conversations: [] });

      expect(
        await screen.findByText("No conversations found"),
      ).toBeInTheDocument();
    });

    it("opens the conversation detail page when a row is clicked", async () => {
      const { history } = setup();

      await findTable();

      await userEvent.click(screen.getAllByTestId("conversation")[0]);

      expect(
        await screen.findByTestId("conversation-detail-page"),
      ).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        Urls.monitorAiAuditingConversationDetail(
          BOBBY_CONVERSATION.conversation_id,
        ),
      );

      act(() => history?.goBack());
      expect(history?.getCurrentLocation().pathname).toBe(CONVERSATIONS_PATH);
    });
  });

  describe("sorting", () => {
    it("requests the default sort on first load", async () => {
      setup();

      await findTable();
      await assertRequestedWithParams({
        sort_by: "created_at",
        sort_dir: "desc",
      });
    });

    it.each([
      { headerLabel: /^User\b/, sortBy: "user" },
      { headerLabel: /^Profile\b/, sortBy: "profile_id" },
      { headerLabel: /^Date\b/, sortBy: "created_at" },
      { headerLabel: /^Messages\b/, sortBy: "message_count" },
      { headerLabel: /^Tokens\b/, sortBy: "total_tokens" },
      { headerLabel: /^Cached tokens\b/, sortBy: "cache_read_tokens" },
      { headerLabel: /^IP\b/, sortBy: "ip_address" },
    ])("sorts by $sortBy", async ({ headerLabel, sortBy }) => {
      setup();

      const table = await findTable();
      fetchMock.clearHistory();
      await userEvent.click(
        within(table).getByRole("columnheader", { name: headerLabel }),
      );

      await assertRequestedWithParams({ sort_by: sortBy, sort_dir: "asc" });
    });
  });

  describe("filters", () => {
    it("applies the filters from the url to the request and the filter selects", async () => {
      setup({
        hasTenants: true,
        initialRoute: `${CONVERSATIONS_PATH}?user=${ROBERT.id}&group=${DATA_GROUP.id}&tenant=${BOBBY_TENANT.id}&date=past6days~`,
      });

      await findTable();
      await assertRequestedWithParams({
        user_id: String(ROBERT.id),
        group_id: String(DATA_GROUP.id),
        tenant_id: String(BOBBY_TENANT.id),
        date: "past6days~",
      });

      expect(
        await screen.findByDisplayValue(ROBERT.common_name),
      ).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue(DATA_GROUP.name),
      ).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue(BOBBY_TENANT.name),
      ).toBeInTheDocument();
    });

    it("filters by user", async () => {
      const { history } = setup();

      await findTable();
      await selectFilterOption(
        "conversation-filters-user-select",
        "Robert Tableton",
      );

      await assertRequestedWithParams({ user_id: String(ROBERT.id) });
      await waitFor(() => {
        expect(
          parseSearchQuery(history?.getCurrentLocation().search ?? ""),
        ).toMatchObject({
          user: String(ROBERT.id),
        });
      });
    });

    it("filters by group", async () => {
      setup();

      await findTable();
      await selectFilterOption("conversation-filters-group-select", "data");

      await assertRequestedWithParams({ group_id: String(DATA_GROUP.id) });
    });

    it("filters by date", async () => {
      setup();

      await findTable();
      await selectFilterOption(
        "conversation-filters-date-select",
        "Last 7 days",
      );

      await assertRequestedWithParams({ date: "past6days~" });
    });

    it("filters by tenant when tenants are enabled", async () => {
      const { history } = setup({ hasTenants: true });

      expect(
        await screen.findByDisplayValue("All tenants"),
      ).toBeInTheDocument();
      await selectFilterOption(
        "conversation-filters-tenant-select",
        ROBERT_TENANT.name,
      );

      await assertRequestedWithParams({ tenant_id: String(ROBERT_TENANT.id) });
      await waitFor(() => {
        expect(
          parseSearchQuery(history?.getCurrentLocation().search ?? ""),
        ).toMatchObject({
          tenant: String(ROBERT_TENANT.id),
        });
      });
    });

    it("hides the tenant filter when tenants are disabled", async () => {
      setup();

      await findTable();
      expect(
        screen.queryByTestId("conversation-filters-tenant-select"),
      ).not.toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("requests and renders the next page of conversations", async () => {
      const conversations = Array.from({ length: 26 }, (_, index) =>
        createSummary({
          conversation_id: `c${index}`,
          title: `Conversation ${index}`,
        }),
      );
      const { history } = setup({ conversations });

      expect(await screen.findByText("Conversation 0")).toBeInTheDocument();
      await userEvent.click(screen.getByTestId("next-page-btn"));

      expect(history?.getCurrentLocation().search).toContain("page=1");
      await assertRequestedWithParams({ offset: "25", limit: "25" });
      expect(await screen.findByText("Conversation 25")).toBeInTheDocument();
      expect(screen.queryByText("Conversation 0")).not.toBeInTheDocument();
    });
  });
});
