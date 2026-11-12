import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupListSessionsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Session, SessionId } from "metabase-types/api";
import {
  createMockSession,
  createMockSessionUser,
  createMockUser,
} from "metabase-types/api/mocks";

import { SessionDetailSidebar } from "./SessionDetailSidebar";

const ADMIN_ID = 1;
const OTHER_USER = createMockSessionUser({
  id: 2,
  email: "rasta@metabase.test",
  common_name: "Rasta Toucan",
});

const LIVE_SESSION = createMockSession({
  id: "live-session",
  user: OTHER_USER,
  ip_address: "10.0.0.1",
});
const ENDED_SESSION = createMockSession({
  id: "ended-session",
  user: OTHER_USER,
  status: "ended",
  ended_at: "2026-09-16T12:00:00Z",
  end_reason: "admin",
  ended_by: ADMIN_ID,
});

type SetupOpts = {
  sessionId?: SessionId;
  /** `null` when the session isn't on the current page, so the sidebar has to look it up */
  sessionFromPage?: Session | null;
  lookupResult?: Session[];
  isRevoking?: boolean;
};

const setup = ({
  sessionId = LIVE_SESSION.id,
  sessionFromPage = LIVE_SESSION,
  lookupResult = [],
  isRevoking = false,
}: SetupOpts = {}) => {
  setupListSessionsEndpoint(lookupResult);

  renderWithProviders(
    <SessionDetailSidebar
      sessionId={sessionId}
      sessionFromPage={sessionFromPage ?? undefined}
      prevSessionId={undefined}
      nextSessionId={undefined}
      isRevoking={isRevoking}
      onNavigate={jest.fn()}
      onRevokeSession={jest.fn()}
      onRevokeUserSessions={jest.fn()}
      onClose={jest.fn()}
    />,
    {
      withUndos: true,
      storeInitialState: {
        currentUser: createMockUser({ id: ADMIN_ID, is_superuser: true }),
      },
    },
  );
};

const queryRevokeSessionButton = () =>
  screen.queryByRole("button", { name: "Revoke session" });
const queryRevokeUserSessionsButton = () =>
  screen.queryByRole("button", { name: "Revoke active sessions" });

describe("SessionDetailSidebar", () => {
  describe("details", () => {
    it("shows a live session's details, with when it expires", () => {
      setup({ sessionFromPage: LIVE_SESSION });

      expect(
        screen.getByRole("heading", { name: "Rasta Toucan" }),
      ).toBeInTheDocument();
      expect(screen.getByText("rasta@metabase.test")).toBeInTheDocument();
      expect(screen.getByText("Password")).toBeInTheDocument();
      expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
      expect(screen.getByText("Expires")).toBeInTheDocument();
      expect(screen.queryByText("Ended")).not.toBeInTheDocument();
      expect(screen.queryByText("Reason")).not.toBeInTheDocument();
    });

    it("shows when and why an ended session ended, instead of when it expires", () => {
      setup({ sessionId: ENDED_SESSION.id, sessionFromPage: ENDED_SESSION });

      expect(screen.getByText("Ended")).toBeInTheDocument();
      expect(screen.getByText("Reason")).toBeInTheDocument();
      expect(screen.getByText("Revoked by admin")).toBeInTheDocument();
      expect(screen.queryByText("Expires")).not.toBeInTheDocument();
    });

    it("shows a placeholder for each detail the session doesn't have", () => {
      setup({
        sessionFromPage: createMockSession({
          user: OTHER_USER,
          device_description: null,
          user_agent: null,
          ip_address: null,
          device_id: null,
          last_active_at: null,
        }),
      });

      expect(screen.getAllByText(EMPTY_CELL_PLACEHOLDER)).toHaveLength(5);
    });
  });

  describe("revoke actions", () => {
    it.each([
      {
        description: "another user's live session",
        session: LIVE_SESSION,
        canRevokeSession: true,
        canRevokeUserSessions: true,
      },
      {
        description: "the session this browser is using",
        session: createMockSession({
          user: createMockSessionUser({ id: ADMIN_ID }),
          current: true,
        }),
        canRevokeSession: false,
        canRevokeUserSessions: false,
      },
      {
        description: "another of the admin's own sessions",
        session: createMockSession({
          user: createMockSessionUser({ id: ADMIN_ID }),
        }),
        canRevokeSession: true,
        canRevokeUserSessions: false,
      },
      {
        description: "another user's ended session",
        session: ENDED_SESSION,
        canRevokeSession: false,
        canRevokeUserSessions: true,
      },
    ])(
      "offers the right actions for $description",
      ({ session, canRevokeSession, canRevokeUserSessions }) => {
        setup({ sessionId: session.id, sessionFromPage: session });

        expect(queryRevokeSessionButton() !== null).toBe(canRevokeSession);
        expect(queryRevokeUserSessionsButton() !== null).toBe(
          canRevokeUserSessions,
        );
      },
    );

    it("disables the revoke actions while a revoke is in flight", () => {
      setup({ isRevoking: true });

      expect(
        screen.getByRole("button", { name: "Revoke session" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Revoke active sessions" }),
      ).toBeDisabled();
    });
  });

  describe("header", () => {
    it("copies a link to the session", async () => {
      setup();
      jest.mocked(navigator.clipboard.writeText).mockClear();

      await userEvent.click(
        screen.getByRole("button", { name: "Copy link to clipboard" }),
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/monitor/sessions/${LIVE_SESSION.id}`,
      );
      expect(
        await screen.findByText("Link copied to clipboard"),
      ).toBeInTheDocument();
    });
  });

  describe("a session that isn't on the current page", () => {
    it("is looked up by its id", async () => {
      setup({
        sessionId: LIVE_SESSION.id,
        sessionFromPage: null,
        lookupResult: [LIVE_SESSION],
      });

      expect(
        await screen.findByRole("heading", { name: "Rasta Toucan" }),
      ).toBeInTheDocument();
      const [lookup] = fetchMock.callHistory.calls(
        "path:/api/ee/session-management",
      );
      expect(new URL(lookup.url).searchParams.getAll("ids")).toEqual([
        LIVE_SESSION.id,
      ]);
    });

    it("says so when the lookup finds nothing", async () => {
      setup({
        sessionId: "gone-session",
        sessionFromPage: null,
        lookupResult: [],
      });

      expect(
        await screen.findByText("This session is no longer active."),
      ).toBeInTheDocument();
      expect(queryRevokeSessionButton()).not.toBeInTheDocument();
      expect(queryRevokeUserSessionsButton()).not.toBeInTheDocument();
    });
  });
});
