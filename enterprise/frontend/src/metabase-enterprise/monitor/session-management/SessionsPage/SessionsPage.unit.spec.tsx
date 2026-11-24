import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListSessionsEndpoint,
  setupListSessionsErrorEndpoint,
  setupRevokeSessionsEndpoint,
  setupRevokeSessionsErrorEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import type {
  RevokeSessionsResponse,
  Session,
  SessionListResponse,
} from "metabase-types/api";
import {
  createMockRevokeSessionsResponse,
  createMockSession,
  createMockSessionUser,
  createMockUser,
} from "metabase-types/api/mocks";

import { SessionsPage } from "./SessionsPage";
import { PAGE_SIZE } from "./constants";

const PATHNAME = "/monitor/sessions";

const ANN_SESSION = createMockSession({
  id: "ann-session",
  user: createMockSessionUser({ id: 2, common_name: "Ann Admin" }),
});
const BOB_SESSION = createMockSession({
  id: "bob-session",
  user: createMockSessionUser({ id: 3, common_name: "Bob Boss" }),
});
const CARL_SESSION = createMockSession({
  id: "carl-session",
  user: createMockSessionUser({ id: 4, common_name: "Carl Coder" }),
});

type SetupOpts = {
  sessions?: Session[];
  total?: number;
  listFails?: boolean;
  /** Answers each list request from its query params, in place of `sessions` and `total` */
  getListResponse?: (params: URLSearchParams) => SessionListResponse;
  initialRoute?: string;
  revokeResponse?: RevokeSessionsResponse;
  revokeError?: Parameters<typeof setupRevokeSessionsErrorEndpoint>[0];
};

const setup = ({
  sessions = [ANN_SESSION, BOB_SESSION, CARL_SESSION],
  total = sessions.length,
  listFails = false,
  getListResponse,
  initialRoute = PATHNAME,
  revokeResponse = createMockRevokeSessionsResponse(),
  revokeError,
}: SetupOpts = {}) => {
  if (listFails) {
    setupListSessionsErrorEndpoint();
  } else if (getListResponse) {
    fetchMock.get("path:/api/ee/session-management", (call) =>
      getListResponse(new URL(call.url).searchParams),
    );
  } else {
    setupListSessionsEndpoint(sessions, { total });
  }
  if (revokeError) {
    setupRevokeSessionsErrorEndpoint(revokeError);
  } else {
    setupRevokeSessionsEndpoint(revokeResponse);
  }

  return renderWithProviders(
    <Route
      path={PATHNAME}
      element={
        <MonitorContent>
          <SessionsPage />
        </MonitorContent>
      }
    >
      <Route path=":sessionId" />
    </Route>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
      storeInitialState: {
        currentUser: createMockUser({ id: 1, is_superuser: true }),
      },
    },
  );
};

const getSidebar = () => screen.findByTestId("session-detail-sidebar");

const getConfirmModal = () => screen.findByTestId("confirm-modal");

const clickSidebarButton = async (name: string) =>
  userEvent.click(
    await within(await getSidebar()).findByRole("button", { name }),
  );

const clickBulkRevoke = () =>
  userEvent.click(
    within(screen.getByTestId("toast-card")).getByRole("button", {
      name: "Revoke",
    }),
  );

const clickRevokeAll = async () =>
  userEvent.click(
    await screen.findByRole("button", { name: "Revoke all active sessions" }),
  );

const confirmRevoke = async () =>
  userEvent.click(
    within(await getConfirmModal()).getByRole("button", { name: "Revoke" }),
  );

const clickRowCheckbox = async (sessionId: string) =>
  userEvent.click(
    within(await screen.findByTestId(`session-row-${sessionId}`)).getByRole(
      "checkbox",
    ),
  );

/** The query params of the latest list request */
const getLastListParams = () => {
  const calls = fetchMock.callHistory.calls("path:/api/ee/session-management");
  return new URL(calls[calls.length - 1].url).searchParams;
};

const queryBulkActionBar = () => screen.queryByTestId("toast-card");

const getRevokeBodies = () =>
  fetchMock.callHistory
    .calls("path:/api/ee/session-management/revoke")
    .map((call) => JSON.parse(String(call.options.body)));

describe("SessionsPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ height: 800, width: 1000 });
  });

  describe("list", () => {
    it("requests the tab in the URL, sorted by sign-in time by default", async () => {
      setup({ initialRoute: `${PATHNAME}?tab=ended` });
      await screen.findByTestId("session-row-ann-session");

      const params = getLastListParams();
      expect(params.get("status")).toBe("ended");
      expect(params.get("limit")).toBe(String(PAGE_SIZE));
      expect(params.get("offset")).toBe("0");
      expect(params.get("sort-column")).toBe("created_at");
      expect(params.get("sort-direction")).toBe("desc");
    });

    it("says when there are no active sessions", async () => {
      setup({ sessions: [] });

      expect(await screen.findByText("No active sessions")).toBeInTheDocument();
      expect(
        screen.queryByText("Ended sessions are kept for 30 days."),
      ).not.toBeInTheDocument();
    });

    it("keeps revoke all available when the search matches nothing, since it ignores the search", async () => {
      setup({ sessions: [], initialRoute: `${PATHNAME}?query=nobody` });

      expect(await screen.findByText("No active sessions")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Revoke all active sessions" }),
      ).toBeEnabled();
    });

    it("explains the empty ended tab, and how long ended sessions are kept", async () => {
      setup({ sessions: [], initialRoute: `${PATHNAME}?tab=ended` });

      expect(
        await screen.findByText(
          "Sessions that have ended will start appearing here as they are timed out, revoked or as users log out",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Ended sessions are kept for 30 days."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Revoke all active sessions" }),
      ).not.toBeInTheDocument();
    });

    it("shows an error when the sessions cannot be loaded", async () => {
      setup({ listFails: true });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    });

    it("switches tabs from the first page, dropping the selection", async () => {
      const { router } = setup({ initialRoute: `${PATHNAME}?page=2` });
      await clickRowCheckbox("ann-session");
      expect(queryBulkActionBar()).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("sessions-tab-ended"));

      await waitFor(() => {
        expect(router?.location.search).toBe("?tab=ended");
      });
      await waitFor(() => {
        expect(getLastListParams().get("status")).toBe("ended");
      });
      expect(getLastListParams().get("offset")).toBe("0");
      expect(queryBulkActionBar()).not.toBeInTheDocument();
    });

    it("drops a sort by auth method when switching to the ended tab, which has no such column", async () => {
      setup({ initialRoute: `${PATHNAME}?sort_column=provider` });
      await screen.findByTestId("session-row-ann-session");

      await userEvent.click(screen.getByTestId("sessions-tab-ended"));

      await waitFor(() => {
        expect(getLastListParams().get("status")).toBe("ended");
      });
      expect(getLastListParams().get("sort-column")).toBe("created_at");
    });

    it("sorts by a column header from the first page, dropping the selection", async () => {
      const { router } = setup({ initialRoute: `${PATHNAME}?page=2` });
      await clickRowCheckbox("ann-session");

      await userEvent.click(screen.getByRole("columnheader", { name: "User" }));

      await waitFor(() => {
        expect(getLastListParams().get("sort-column")).toBe("user_email");
      });
      await waitFor(() => {
        expect(router?.location.search).toContain("sort_column=user_email");
      });
      expect(router?.location.search).not.toContain("page=");
      expect(queryBulkActionBar()).not.toBeInTheDocument();
    });

    it("pages to the next set of sessions, dropping the selection", async () => {
      setup({ total: PAGE_SIZE + 10 });
      await clickRowCheckbox("ann-session");

      await userEvent.click(screen.getByRole("button", { name: "Next page" }));

      await waitFor(() => {
        expect(getLastListParams().get("offset")).toBe(String(PAGE_SIZE));
      });
      expect(queryBulkActionBar()).not.toBeInTheDocument();
    });
  });

  describe("ended tab", () => {
    const user = (id: number, common_name: string) =>
      createMockSessionUser({ id, common_name });
    const DEACTIVATED = createMockSession({
      id: "deactivated-session",
      user: user(5, "No Data Tableton"),
      status: "ended",
      end_reason: "user-deactivated",
    });
    const PASSWORD_CHANGED = createMockSession({
      id: "password-changed-session",
      user: user(6, "Robert Tableton"),
      status: "ended",
      end_reason: "password-change",
    });
    const SUPPORT_ACCESS = createMockSession({
      id: "support-access-session",
      user: user(7, "Support Engineer"),
      provider: "support-access-grant",
      status: "ended",
      end_reason: "support-grant-revoked",
    });
    const LOGGED_OUT = createMockSession({
      id: "logged-out-session",
      user: user(8, "Read Only Tableton"),
      status: "ended",
      end_reason: "logout",
    });
    const ENDED = [DEACTIVATED, PASSWORD_CHANGED, SUPPORT_ACCESS, LOGGED_OUT];

    /** Lists the ended sessions that match the request, as the endpoint would */
    const getEndedListResponse = (
      params: URLSearchParams,
    ): SessionListResponse => {
      const reason = params.get("reason");
      const providers = params.getAll("provider");
      const query = params.get("query")?.toLowerCase();
      const data =
        params.get("status") !== "ended"
          ? []
          : ENDED.filter(
              (session) =>
                (reason === null || session.end_reason === reason) &&
                (providers.length === 0 ||
                  providers.includes(session.provider)) &&
                (query === undefined ||
                  session.user.common_name?.toLowerCase().includes(query)),
            );
      return { data, total: data.length, limit: PAGE_SIZE, offset: 0 };
    };

    const expectOnlyListed = async (...listed: Session[]) => {
      await waitFor(() => {
        ENDED.forEach((session) => {
          const row = screen.queryByTestId(`session-row-${session.id}`);
          if (listed.includes(session)) {
            expect(row).toBeInTheDocument();
          } else {
            expect(row).not.toBeInTheDocument();
          }
        });
      });
    };

    const openFilters = () =>
      userEvent.click(screen.getByRole("button", { name: "Show filters" }));

    const applyFilters = async () =>
      userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Apply",
        }),
      );

    const clearFilters = async () => {
      await openFilters();
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Clear filters",
        }),
      );
    };

    it("narrows the ended sessions by reason, auth method and search", async () => {
      const { router } = setup({
        initialRoute: `${PATHNAME}?tab=ended`,
        getListResponse: getEndedListResponse,
      });
      await expectOnlyListed(...ENDED);
      expect(
        await screen.findByTestId("session-row-logged-out-session"),
      ).toHaveTextContent("Signed out");
      expect(
        screen.getByTestId("session-row-deactivated-session"),
      ).toHaveTextContent("User deactivated");
      expect(
        screen.getByTestId("session-row-password-changed-session"),
      ).toHaveTextContent("Password changed");
      expect(
        screen.getByTestId("session-row-support-access-session"),
      ).toHaveTextContent("Support access revoked");

      await openFilters();
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("textbox", {
          name: "Reason",
        }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Password changed" }),
      );
      await applyFilters();
      await expectOnlyListed(PASSWORD_CHANGED);
      expect(getLastListParams().get("reason")).toBe("password-change");

      await clearFilters();
      // the unfiltered list comes back from the cache, without a new request
      await expectOnlyListed(...ENDED);
      await waitFor(() => {
        expect(router?.location.search).toBe("?tab=ended");
      });

      await openFilters();
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Support access",
        }),
      );
      await applyFilters();
      await expectOnlyListed(SUPPORT_ACCESS);
      expect(getLastListParams().getAll("provider")).toEqual([
        "support-access-grant",
      ]);

      await clearFilters();
      await expectOnlyListed(...ENDED);
      await userEvent.type(
        screen.getByLabelText("Search sessions"),
        "Read Only",
      );
      await expectOnlyListed(LOGGED_OUT);
      expect(getLastListParams().get("query")).toBe("Read Only");
      expect(getLastListParams().has("provider")).toBe(false);
    });

    it("is read-only: no selection, and no way to revoke an ended session itself", async () => {
      const revokedByAdmin = (id: string, userId: number, name: string) =>
        createMockSession({
          id,
          user: user(userId, name),
          status: "ended",
          end_reason: "admin",
        });
      setup({
        initialRoute: `${PATHNAME}?tab=ended`,
        sessions: [
          revokedByAdmin("first-revoked", 5, "No Data Tableton"),
          revokedByAdmin("second-revoked", 6, "Robert Tableton"),
        ],
      });

      await userEvent.click(
        await screen.findByTestId("session-row-second-revoked"),
      );

      expect(
        within(screen.getByTestId("sessions-table")).queryAllByRole("checkbox"),
      ).toHaveLength(0);
      const sidebar = await getSidebar();
      expect(
        within(sidebar).getByRole("heading", { name: "Robert Tableton" }),
      ).toBeInTheDocument();
      expect(within(sidebar).getByText("Revoked by admin")).toBeInTheDocument();
      expect(
        within(sidebar).getByRole("button", { name: "Revoke active sessions" }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", { name: "Revoke session" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("the admin's own session", () => {
    it("can't be selected or revoked from here", async () => {
      const own = createMockSession({
        id: "own-session",
        user: createMockSessionUser({ id: 1, common_name: "Bobby Tables" }),
        current: true,
      });
      setup({ sessions: [ANN_SESSION, own, BOB_SESSION] });

      const ownRow = await screen.findByTestId("session-row-own-session");
      expect(within(ownRow).getByText("This session")).toBeInTheDocument();
      expect(within(ownRow).getByRole("checkbox")).toBeDisabled();
      expect(
        within(screen.getByTestId("session-row-ann-session")).getByRole(
          "checkbox",
        ),
      ).toBeEnabled();

      await userEvent.click(ownRow);

      const sidebar = await getSidebar();
      expect(
        within(sidebar).getByRole("heading", { name: "Bobby Tables" }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", { name: "Revoke session" }),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", {
          name: "Revoke active sessions",
        }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(sidebar).getByRole("button", { name: "Close" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("session-detail-sidebar"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("detail sidebar", () => {
    it("opens a session from its row and closes again, keeping the search in the URL", async () => {
      const { router } = setup({ initialRoute: `${PATHNAME}?query=ann` });

      await userEvent.click(
        await screen.findByTestId("session-row-ann-session"),
      );

      expect(router?.location.pathname).toBe(`${PATHNAME}/ann-session`);
      expect(router?.location.search).toBe("?query=ann");
      expect(
        within(await getSidebar()).getByRole("heading", { name: "Ann Admin" }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      await waitFor(() => {
        expect(router?.location.pathname).toBe(PATHNAME);
      });
      expect(router?.location.search).toBe("?query=ann");
      expect(
        screen.queryByTestId("session-detail-sidebar"),
      ).not.toBeInTheDocument();
    });

    it("steps through the sessions in the order the table shows them", async () => {
      const { router } = setup({ initialRoute: `${PATHNAME}/ann-session` });
      const sidebar = await getSidebar();

      expect(
        await within(sidebar).findByRole("heading", { name: "Ann Admin" }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).getByRole("button", { name: "Previous session" }),
      ).toBeDisabled();

      await clickSidebarButton("Next session");

      expect(router?.location.pathname).toBe(`${PATHNAME}/bob-session`);
      expect(
        await within(await getSidebar()).findByRole("heading", {
          name: "Bob Boss",
        }),
      ).toBeInTheDocument();
    });

    it("stays open when a revoke doesn't include the session it shows", async () => {
      const { router } = setup({ initialRoute: `${PATHNAME}/ann-session` });
      await getSidebar();

      await clickRowCheckbox("bob-session");
      await clickBulkRevoke();
      await confirmRevoke();

      await waitFor(() => {
        expect(getRevokeBodies()).toEqual([{ ids: ["bob-session"] }]);
      });
      expect(router?.location.pathname).toBe(`${PATHNAME}/ann-session`);
      expect(await getSidebar()).toBeInTheDocument();
    });
  });

  describe("revoking", () => {
    it.each([
      {
        action: "a single session from the sidebar",
        initialRoute: `${PATHNAME}/ann-session`,
        trigger: () => clickSidebarButton("Revoke session"),
        title: "Revoke this session?",
        body: { ids: ["ann-session"] },
      },
      {
        action: "every session of a user from the sidebar",
        initialRoute: `${PATHNAME}/ann-session`,
        trigger: () => clickSidebarButton("Revoke active sessions"),
        title: "Revoke all sessions for Ann Admin?",
        body: { "user-id": 2 },
      },
      {
        action: "the selected sessions",
        initialRoute: PATHNAME,
        trigger: async () => {
          await clickRowCheckbox("ann-session");
          await clickRowCheckbox("bob-session");
          await clickBulkRevoke();
        },
        title: "Revoke 2 sessions?",
        body: { ids: ["ann-session", "bob-session"] },
      },
      {
        action: "every active session",
        initialRoute: PATHNAME,
        trigger: clickRevokeAll,
        title: "Revoke all sessions?",
        body: {},
      },
    ])(
      "confirms before revoking $action, then sends its criteria and closes any sidebar",
      async ({ initialRoute, trigger, title, body }) => {
        const { router } = setup({ initialRoute });

        await trigger();

        expect(
          within(await getConfirmModal()).getByText(title),
        ).toBeInTheDocument();
        expect(getRevokeBodies()).toEqual([]);

        await confirmRevoke();

        await waitFor(() => {
          expect(getRevokeBodies()).toEqual([body]);
        });
        await waitFor(() => {
          expect(router?.location.pathname).toBe(PATHNAME);
        });
      },
    );

    it("re-requests the list after a revoke", async () => {
      setup();
      await screen.findByTestId("session-row-ann-session");
      const listCalls = () =>
        fetchMock.callHistory.calls("path:/api/ee/session-management").length;
      const callsBefore = listCalls();

      await clickRevokeAll();
      await confirmRevoke();

      await waitFor(() => {
        expect(listCalls()).toBeGreaterThan(callsBefore);
      });
    });

    it("goes back to the last page when a revoke empties a later one", async () => {
      const lastSession = createMockSession({
        id: "last-session",
        user: createMockSessionUser({ id: 5, common_name: "Lee Last" }),
      });
      let isLastSessionRevoked = false;
      const { router } = setup({
        initialRoute: `${PATHNAME}?page=1`,
        getListResponse: (params) => {
          const isFirstPage = params.get("offset") === "0";
          const secondPage = isLastSessionRevoked ? [] : [lastSession];
          return {
            data: isFirstPage
              ? [ANN_SESSION, BOB_SESSION, CARL_SESSION]
              : secondPage,
            total: isLastSessionRevoked ? PAGE_SIZE : PAGE_SIZE + 1,
            limit: PAGE_SIZE,
            offset: Number(params.get("offset")),
          };
        },
      });

      await clickRowCheckbox("last-session");
      await clickBulkRevoke();
      isLastSessionRevoked = true;
      await confirmRevoke();

      expect(
        await screen.findByTestId("session-row-ann-session"),
      ).toBeInTheDocument();
      expect(getLastListParams().get("offset")).toBe("0");
      expect(router?.location.search).not.toContain("page=");
      expect(screen.queryByText("No active sessions")).not.toBeInTheDocument();
    });

    it("revokes nothing when the confirmation is cancelled", async () => {
      setup({ initialRoute: `${PATHNAME}/ann-session` });

      await clickSidebarButton("Revoke session");
      await userEvent.click(
        within(await getConfirmModal()).getByRole("button", { name: "Cancel" }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId("confirm-modal")).not.toBeInTheDocument();
      });
      expect(getRevokeBodies()).toEqual([]);
    });

    it.each([
      { remaining: 0, warns: false },
      { remaining: 2, warns: true },
    ])(
      "reports how many were revoked, warning only if sessions started meanwhile (remaining: $remaining)",
      async ({ remaining, warns }) => {
        setup({
          revokeResponse: createMockRevokeSessionsResponse({
            revoked: 3,
            remaining,
          }),
        });

        await clickRevokeAll();
        await confirmRevoke();

        expect(
          await screen.findByText("Revoked 3 sessions"),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(
            `${remaining} new sessions started while revoking`,
          ) !== null,
        ).toBe(warns);
      },
    );

    it("stays open after revoking the user of the ended session it shows", async () => {
      const ended = createMockSession({
        id: "ended-session",
        user: ANN_SESSION.user,
        status: "ended",
        end_reason: "logout",
      });
      const { router } = setup({
        sessions: [ended],
        initialRoute: `${PATHNAME}/ended-session?tab=ended`,
      });

      await clickSidebarButton("Revoke active sessions");
      await confirmRevoke();

      await waitFor(() => {
        expect(getRevokeBodies()).toEqual([{ "user-id": 2 }]);
      });
      expect(router?.location.pathname).toBe(`${PATHNAME}/ended-session`);
    });

    it("shows the server's reason when a revoke is refused", async () => {
      setup({ revokeError: { status: 400, message: "Too many sessions" } });

      await clickRevokeAll();
      await confirmRevoke();

      expect(await screen.findByText("Too many sessions")).toBeInTheDocument();
    });

    it("shows an error, and keeps the sidebar open, when the revoke fails", async () => {
      const { router } = setup({
        initialRoute: `${PATHNAME}/ann-session`,
        revokeError: {},
      });

      await clickSidebarButton("Revoke session");
      await confirmRevoke();

      expect(
        await screen.findByText("Could not revoke sessions."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Revoked /)).not.toBeInTheDocument();
      expect(router?.location.pathname).toBe(`${PATHNAME}/ann-session`);
    });
  });
});
