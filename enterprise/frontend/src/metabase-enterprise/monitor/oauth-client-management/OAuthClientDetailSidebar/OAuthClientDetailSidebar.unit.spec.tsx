import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetOAuthClientEndpoint,
  setupGetOAuthClientNotFoundEndpoint,
  setupOAuthAuthorizationsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  ListOAuthAuthorizationsResponse,
  OAuthClient,
  OAuthClientDetail,
  OAuthClientId,
} from "metabase-types/api";
import {
  createMockListOAuthAuthorizationsResponse,
  createMockOAuthAuthorization,
  createMockOAuthClient,
  createMockOAuthClientDetail,
  createMockOAuthClientRevoker,
  createMockOAuthClientUser,
} from "metabase-types/api/mocks";

import { OAuthClientDetailSidebar } from "./OAuthClientDetailSidebar";

const ACTIVE_CLIENT = createMockOAuthClient({
  client_id: "active-client",
  client_name: "Claude Code",
});

const ACTIVE_DETAIL = createMockOAuthClientDetail({
  ...ACTIVE_CLIENT,
  scopes: ["mb:full", "agent:content:read"],
  contacts: ["ops@claude.ai"],
  users: [createMockOAuthClientUser({ common_name: "Rasta Toucan" })],
});

const REVOKED_DETAIL = createMockOAuthClientDetail({
  client_id: "revoked-client",
  client_name: "Retired Bot",
  status: "revoked",
  revoked_at: "2026-09-16T12:00:00Z",
  revoked_by: createMockOAuthClientRevoker({ common_name: "Ann Admin" }),
  live_tokens: 0,
  user_count: 0,
  users: [],
});

type SetupOpts = {
  clientId?: OAuthClientId;
  /** `null` when the list did not hand a row over, so the sidebar has only what it fetches */
  clientFromPage?: OAuthClient | null;
  detail?: OAuthClientDetail | null;
  activity?: ListOAuthAuthorizationsResponse;
  isRevoking?: boolean;
};

const setup = ({
  clientId = ACTIVE_CLIENT.client_id,
  clientFromPage = ACTIVE_CLIENT,
  detail = ACTIVE_DETAIL,
  activity = createMockListOAuthAuthorizationsResponse({ data: [], total: 0 }),
  isRevoking = false,
}: SetupOpts = {}) => {
  if (detail === null) {
    setupGetOAuthClientNotFoundEndpoint(clientId);
  } else {
    setupGetOAuthClientEndpoint(detail);
  }
  setupOAuthAuthorizationsEndpoint(activity);

  renderWithProviders(
    <OAuthClientDetailSidebar
      clientId={clientId}
      clientFromPage={clientFromPage ?? undefined}
      prevClientId={undefined}
      nextClientId={undefined}
      isRevoking={isRevoking}
      onNavigate={jest.fn()}
      onRevokeClient={jest.fn()}
      onClose={jest.fn()}
    />,
    { withUndos: true },
  );
};

const queryRevokeButton = () =>
  screen.queryByRole("button", { name: "Revoke client" });

describe("OAuthClientDetailSidebar", () => {
  describe("details", () => {
    it("shows what the client registered, once the detail lands on top of the row", async () => {
      setup();

      expect(
        screen.getByRole("heading", { name: "Claude Code" }),
      ).toBeInTheDocument();
      expect(screen.getByText(ACTIVE_CLIENT.client_id)).toBeInTheDocument();
      // `scopes` and `contacts` are the detail's own, so they are not on the handed-over row
      expect(await screen.findByText("mb:full")).toBeInTheDocument();
      expect(screen.getByText("ops@claude.ai")).toBeInTheDocument();
      expect(screen.queryByText("Revoked by")).not.toBeInTheDocument();
    });

    it("shows when and who revoked a revoked client", async () => {
      setup({
        clientId: REVOKED_DETAIL.client_id,
        clientFromPage: null,
        detail: REVOKED_DETAIL,
      });

      expect(await screen.findByText("Revoked by")).toBeInTheDocument();
      expect(screen.getByText("Ann Admin")).toBeInTheDocument();
    });

    it("says so for a client that has never presented a token", async () => {
      setup({
        detail: createMockOAuthClientDetail({
          ...ACTIVE_CLIENT,
          last_used_at: null,
        }),
      });

      expect(await screen.findByText("Never used")).toBeInTheDocument();
    });

    it("shows a placeholder for each registration field the client left out", async () => {
      setup({
        clientFromPage: null,
        detail: createMockOAuthClientDetail({
          ...ACTIVE_CLIENT,
          client_uri: null,
          application_type: null,
          redirect_uris: [],
          contacts: [],
        }),
      });

      expect(await screen.findByText("Scopes")).toBeInTheDocument();
      expect(screen.getAllByText(EMPTY_CELL_PLACEHOLDER)).toHaveLength(4);
    });
  });

  describe("users", () => {
    it("lists who is connected through the client", async () => {
      setup();

      expect(await screen.findByText("Rasta Toucan")).toBeInTheDocument();
      expect(screen.getByText("1 live token")).toBeInTheDocument();
    });

    it("says so when nobody is connected", async () => {
      setup({
        clientId: REVOKED_DETAIL.client_id,
        clientFromPage: null,
        detail: REVOKED_DETAIL,
      });

      expect(
        await screen.findByText(
          "Nobody is connected through this client right now.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("activity", () => {
    it("shows the client's own events from the Authorization logs", async () => {
      setup({
        activity: createMockListOAuthAuthorizationsResponse({
          data: [
            createMockOAuthAuthorization({
              event_type: "revoked",
              user_email: "ann@metabase.test",
            }),
          ],
          total: 1,
        }),
      });

      expect(await screen.findByText("Revoked")).toBeInTheDocument();
      expect(screen.getByText("ann@metabase.test")).toBeInTheDocument();
      const [activity] = fetchMock.callHistory.calls(
        "path:/api/oauth/authorizations",
      );
      expect(new URL(activity.url).searchParams.get("client-id")).toBe(
        ACTIVE_CLIENT.client_id,
      );
    });

    it("says so when the client has no events on record", async () => {
      setup();

      expect(
        await screen.findByText("No activity on record for this client."),
      ).toBeInTheDocument();
    });
  });

  describe("revoke action", () => {
    it.each([
      {
        description: "an active client the caller is not acting through",
        client: ACTIVE_CLIENT,
        canRevoke: true,
      },
      {
        description: "the client the caller's own token came from",
        client: createMockOAuthClient({
          client_id: "current-client",
          current: true,
        }),
        canRevoke: false,
      },
      {
        description: "a client that is already revoked",
        client: createMockOAuthClient({
          client_id: "revoked-client",
          status: "revoked",
        }),
        canRevoke: false,
      },
    ])(
      "offers the right action for $description",
      async ({ client, canRevoke }) => {
        setup({
          clientId: client.client_id,
          clientFromPage: client,
          detail: createMockOAuthClientDetail(client),
        });

        expect(await screen.findByText("Scopes")).toBeInTheDocument();
        expect(queryRevokeButton() !== null).toBe(canRevoke);
      },
    );

    it("disables the revoke action while a revoke is in flight", () => {
      setup({ isRevoking: true });

      expect(
        screen.getByRole("button", { name: "Revoke client" }),
      ).toBeDisabled();
    });
  });

  describe("header", () => {
    it("copies a link to the client", async () => {
      setup();
      jest.mocked(navigator.clipboard.writeText).mockClear();

      await userEvent.click(
        screen.getByRole("button", { name: "Copy link to clipboard" }),
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/monitor/oauth-clients/${ACTIVE_CLIENT.client_id}`,
      );
      expect(
        await screen.findByText("Link copied to clipboard"),
      ).toBeInTheDocument();
    });
  });

  describe("a client that is no longer registered", () => {
    it("says so when the id names nothing, rather than showing the lookup as an error", async () => {
      setup({ clientId: "gone-client", clientFromPage: null, detail: null });

      expect(
        await screen.findByText("This client is no longer registered."),
      ).toBeInTheDocument();
      expect(queryRevokeButton()).not.toBeInTheDocument();
    });
  });
});
