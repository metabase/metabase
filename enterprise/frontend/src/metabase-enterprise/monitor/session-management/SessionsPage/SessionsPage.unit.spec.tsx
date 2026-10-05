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
import type { RevokeSessionsResponse, Session } from "metabase-types/api";
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
  initialRoute?: string;
  revokeResponse?: RevokeSessionsResponse;
  revokeFails?: boolean;
};

const setup = ({
  sessions = [ANN_SESSION, BOB_SESSION, CARL_SESSION],
  total = sessions.length,
  listFails = false,
  initialRoute = PATHNAME,
  revokeResponse = createMockRevokeSessionsResponse(),
  revokeFails = false,
}: SetupOpts = {}) => {
  if (listFails) {
    setupListSessionsErrorEndpoint();
  } else {
    setupListSessionsEndpoint(sessions, { total });
  }
  if (revokeFails) {
    setupRevokeSessionsErrorEndpoint();
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
        screen.getByRole("button", { name: "Revoke all active sessions" }),
      ).toBeDisabled();
      expect(
        screen.queryByText("Ended sessions are kept for 30 days."),
      ).not.toBeInTheDocument();
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

    it("shows an error, and keeps the sidebar open, when the revoke fails", async () => {
      const { router } = setup({
        initialRoute: `${PATHNAME}/ann-session`,
        revokeFails: true,
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
