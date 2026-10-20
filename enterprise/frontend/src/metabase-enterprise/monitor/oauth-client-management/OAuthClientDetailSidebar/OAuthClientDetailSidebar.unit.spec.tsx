import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetOAuthClientEndpoint,
  setupGetOAuthClientNotFoundEndpoint,
  setupOAuthAuthorizationsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
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
  /** `null`: no row from the list, only the fetched detail */
  clientFromPage?: OAuthClient | null;
  detail?: OAuthClientDetail | null;
  isDetailPending?: boolean;
  activity?: ListOAuthAuthorizationsResponse;
  isRevoking?: boolean;
};

const setup = ({
  clientId = ACTIVE_CLIENT.client_id,
  clientFromPage = ACTIVE_CLIENT,
  detail = ACTIVE_DETAIL,
  isDetailPending = false,
  activity = createMockListOAuthAuthorizationsResponse({ data: [], total: 0 }),
  isRevoking = false,
}: SetupOpts = {}) => {
  let landDetail: () => void = () => undefined;
  if (detail === null) {
    setupGetOAuthClientNotFoundEndpoint(clientId);
  } else if (isDetailPending) {
    const pendingDetail = new Promise<OAuthClientDetail>((resolve) => {
      landDetail = () => resolve(detail);
    });
    fetchMock.get(
      `path:/api/ee/oauth-client-management/${clientId}`,
      pendingDetail,
    );
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

  return { landDetail };
};

const queryRevokeButton = () =>
  screen.queryByRole("button", { name: "Revoke client" });

describe("OAuthClientDetailSidebar", () => {
  describe("details", () => {
    it("shows what the client registered, once the detail lands on top of the row", async () => {
      setup({
        detail: createMockOAuthClientDetail({
          ...ACTIVE_DETAIL,
          client_uri: "https://bot.example.com",
          application_type: "web",
          redirect_uris: ["https://bot.example.com/cb"],
        }),
      });

      expect(
        screen.getByRole("heading", { name: "Claude Code" }),
      ).toBeInTheDocument();
      expect(screen.getByText(ACTIVE_CLIENT.client_id)).toBeInTheDocument();
      // detail-only fields, so they arrive after the row
      expect(await screen.findByText("mb:full")).toBeInTheDocument();
      expect(screen.getByText("agent:content:read")).toBeInTheDocument();
      expect(screen.getByText("ops@claude.ai")).toBeInTheDocument();
      expect(
        await screen.findByText("https://bot.example.com"),
      ).toBeInTheDocument();
      expect(screen.getByText("web")).toBeInTheDocument();
      expect(screen.getByText("Dynamic")).toBeInTheDocument();
      expect(
        screen.getByText("https://bot.example.com/cb"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Revoked by")).not.toBeInTheDocument();
    });

    it("shows when the client was last used", async () => {
      setup();

      expect(screen.getByText("Last used")).toBeInTheDocument();
      expect(await screen.findByText(/September 28, 2026/)).toBeInTheDocument();
    });

    it("shows when and who revoked a revoked client", async () => {
      setup({
        clientId: REVOKED_DETAIL.client_id,
        clientFromPage: null,
        detail: REVOKED_DETAIL,
      });

      expect(await screen.findByText("Revoked by")).toBeInTheDocument();
      expect(screen.getByText("Ann Admin")).toBeInTheDocument();
      expect(screen.getByText("Revoked")).toBeInTheDocument();
      expect(screen.getByText(/September 16, 2026/)).toBeInTheDocument();
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
    it("names each connected user with their live tokens and when they last approved", async () => {
      setup({
        detail: createMockOAuthClientDetail({
          ...ACTIVE_DETAIL,
          users: [
            createMockOAuthClientUser({
              id: 1,
              common_name: "Ada Admin",
              live_tokens: 2,
              last_approved_at: "2026-09-20T12:00:00Z",
            }),
            createMockOAuthClientUser({
              id: 2,
              common_name: null,
              email: "bo@example.com",
              live_tokens: 1,
              last_approved_at: null,
            }),
          ],
        }),
      });

      expect(await screen.findByText("Ada Admin")).toBeInTheDocument();
      expect(screen.getByText("2 live tokens")).toBeInTheDocument();
      expect(screen.getByText("Last approved")).toBeInTheDocument();
      expect(screen.getByText("bo@example.com")).toBeInTheDocument();
      expect(screen.getByText("1 live token")).toBeInTheDocument();
      expect(screen.getByText("No approval on record")).toBeInTheDocument();
    });

    it("says nobody is connected only once the detail has landed", async () => {
      const { landDetail } = setup({
        detail: createMockOAuthClientDetail({ ...ACTIVE_DETAIL, users: [] }),
        isDetailPending: true,
      });

      const users = await screen.findByTestId("oauth-client-users");
      expect(
        within(users).queryByText(
          "Nobody is connected through this client right now.",
        ),
      ).not.toBeInTheDocument();

      landDetail();

      expect(
        await within(users).findByText(
          "Nobody is connected through this client right now.",
        ),
      ).toBeInTheDocument();
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
    it("shows the client's own events from the Authorization logs, newest first", async () => {
      setup({
        activity: createMockListOAuthAuthorizationsResponse({
          data: [
            createMockOAuthAuthorization({
              id: 2,
              event_type: "revoked",
              user_email: "ann@metabase.test",
            }),
            createMockOAuthAuthorization({
              id: 1,
              event_type: "registered",
              user_email: null,
            }),
          ],
          total: 2,
        }),
      });

      const section = screen.getByTestId("oauth-client-activity");
      expect(await within(section).findByText("Revoked")).toBeInTheDocument();
      expect(
        within(section).getByText("ann@metabase.test"),
      ).toBeInTheDocument();
      expect(
        within(section)
          .getAllByText(/^(Revoked|Registered)$/)
          .map((label) => label.textContent),
      ).toEqual(["Revoked", "Registered"]);
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
        description: "an active client",
        client: ACTIVE_CLIENT,
        canRevoke: true,
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

        expect(await screen.findByText("mb:full")).toBeInTheDocument();
        expect(queryRevokeButton() !== null).toBe(canRevoke);
      },
    );

    it("disables the revoke action while a revoke is in flight", () => {
      setup({ isRevoking: true });

      expect(
        screen.getByRole("button", { name: "Revoke client" }),
      ).toBeDisabled();
    });

    it("isn't offered while the detail shows an error", async () => {
      fetchMock.get(
        `path:/api/ee/oauth-client-management/${ACTIVE_CLIENT.client_id}`,
        500,
      );
      setup();

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
      expect(queryRevokeButton()).not.toBeInTheDocument();
    });
  });

  it("copies a link to the client's own page", async () => {
    setup();
    jest.mocked(navigator.clipboard.writeText).mockClear();

    await userEvent.click(
      screen.getByRole("button", { name: "Copy link to clipboard" }),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/monitor/oauth-clients/${ACTIVE_CLIENT.client_id}`,
    );
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
