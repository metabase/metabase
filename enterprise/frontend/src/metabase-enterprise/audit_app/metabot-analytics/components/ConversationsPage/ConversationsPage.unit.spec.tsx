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
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route, withRouteProps } from "metabase/router";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  ALL_USERS_GROUP,
  BOBBY,
  BOBBY_TENANT,
  DATA_GROUP,
  ROBERT,
  ROBERT_TENANT,
  selectFilterOption,
} from "../../tests/fixtures";
import type { ConversationSummary } from "../../types";

import { ConversationsPage } from "./ConversationsPage";

const RoutedConversationsPage = withRouteProps(ConversationsPage);

jest.mock("metabase/admin/ai/MetabotAdminLayout", () => ({
  MetabotAdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));

const CONVERSATIONS_PATH = "/admin/metabot/usage-auditing/conversations";
const CONVERSATIONS_ENDPOINT = "path:/api/ee/metabot-analytics/conversations";

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

const BOBBY_CONVERSATION = createSummary({
  conversation_id: "c1",
  title: "How many orders?",
  profile_id: "nlq",
  ip_address: "10.0.0.1",
  message_count: 4,
  total_tokens: 1200,
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
  setupEnterprisePlugins();
  setupListMetabotAnalyticsConversationsEndpoint(conversations, total);
  setupUsersEndpoints([BOBBY, ROBERT]);
  setupGroupsEndpoint([ALL_USERS_GROUP, DATA_GROUP]);
  setupTenantEntpoints([BOBBY_TENANT, ROBERT_TENANT]);

  return renderWithProviders(
    <>
      <Route path={CONVERSATIONS_PATH} element={<RoutedConversationsPage />} />
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

describe("ConversationsPage", () => {
  describe("table", () => {
    it("renders the title, user, profile label and IP address of each conversation", async () => {
      setup();

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

      const table = screen.getByRole("table");
      expect(within(table).getByText("Bobby Tables")).toBeInTheDocument();
      expect(within(table).getByText("NLQ")).toBeInTheDocument();
      expect(within(table).getByText("10.0.0.1")).toBeInTheDocument();
      expect(within(table).getByText("Robert Tableton")).toBeInTheDocument();
      expect(within(table).getByText("SQL")).toBeInTheDocument();
      expect(within(table).getByText("10.0.0.3")).toBeInTheDocument();
    });

    it("shows an empty state when no conversations match", async () => {
      setup({ conversations: [] });

      expect(
        await screen.findByText("No conversations found"),
      ).toBeInTheDocument();
    });

    it("opens the conversation detail page when a row is clicked", async () => {
      const { history } = setup();

      await userEvent.click(await screen.findByText("How many orders?"));

      expect(
        await screen.findByTestId("conversation-detail-page"),
      ).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        `${CONVERSATIONS_PATH}/${BOBBY_CONVERSATION.conversation_id}`,
      );
    });
  });

  describe("sorting", () => {
    it("requests the default sort on first load", async () => {
      setup();

      await screen.findByRole("table");
      await assertRequestedWithParams({
        sort_by: "created_at",
        sort_dir: "desc",
      });
    });

    it.each([
      { headerLabel: /^User/, sortBy: "user" },
      { headerLabel: /^Profile/, sortBy: "profile_id" },
      { headerLabel: /^Date/, sortBy: "created_at" },
      { headerLabel: /^Messages/, sortBy: "message_count" },
      { headerLabel: /^Tokens/, sortBy: "total_tokens" },
      { headerLabel: /^Cached tokens/, sortBy: "cache_read_tokens" },
      { headerLabel: /^IP/, sortBy: "ip_address" },
    ])("sorts by $sortBy", async ({ headerLabel, sortBy }) => {
      setup();

      const table = await screen.findByRole("table");
      fetchMock.clearHistory();
      await userEvent.click(
        within(table).getByRole("button", { name: headerLabel }),
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

      await screen.findByRole("table");
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

      await screen.findByRole("table");
      await selectFilterOption(
        "conversation-filters-user-select",
        "Robert Tableton",
      );

      await assertRequestedWithParams({ user_id: String(ROBERT.id) });
      await waitFor(() => {
        expect(history?.getCurrentLocation().query).toMatchObject({
          user: String(ROBERT.id),
        });
      });
    });

    it("filters by group", async () => {
      setup();

      await screen.findByRole("table");
      await selectFilterOption("conversation-filters-group-select", "data");

      await assertRequestedWithParams({ group_id: String(DATA_GROUP.id) });
    });

    it("filters by date", async () => {
      setup();

      await screen.findByRole("table");
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
        expect(history?.getCurrentLocation().query).toMatchObject({
          tenant: String(ROBERT_TENANT.id),
        });
      });
    });

    it("hides the tenant filter when tenants are disabled", async () => {
      setup();

      await screen.findByRole("table");
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
      setup({ conversations });

      expect(await screen.findByText("Conversation 0")).toBeInTheDocument();
      await userEvent.click(screen.getByLabelText("Next page"));

      await assertRequestedWithParams({ offset: "25", limit: "25" });
      expect(await screen.findByText("Conversation 25")).toBeInTheDocument();
      expect(screen.queryByText("Conversation 0")).not.toBeInTheDocument();
    });
  });
});
