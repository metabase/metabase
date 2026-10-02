import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import { setupOAuthAuthorizationsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { ListOAuthAuthorizationsResponse } from "metabase-types/api";
import {
  createMockListOAuthAuthorizationsResponse,
  createMockOAuthAuthorization,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { OAuthAuthorizationsPage } from "./OAuthAuthorizationsPage";
import { OAUTH_PAGE_SIZE } from "./oauth-utils";

// TreeTable virtualizes its rows, which renders nothing in jsdom. Mock it to
// render each row's cells via flexRender so the column cell logic is exercised.
jest.mock("metabase/ui/components/data-display/TreeTable/TreeTable", () => {
  const { flexRender } = jest.requireActual("@tanstack/react-table");
  return {
    TreeTable: ({
      instance,
      emptyState,
    }: {
      instance: { table: { getRowModel: () => { rows: any[] } } };
      emptyState: ReactNode;
    }) => {
      const rows = instance.table.getRowModel().rows;
      if (rows.length === 0) {
        return <div>{emptyState}</div>;
      }
      return (
        <div>
          {rows.map((row) => (
            <div key={row.id} role="row">
              {row.getVisibleCells().map((cell: any) => (
                <span key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

jest.mock("metabase/common/monitor/analytics", () => ({
  trackMonitorSectionClicked: jest.fn(),
}));

const { trackMonitorSectionClicked } = jest.requireMock(
  "metabase/common/monitor/analytics",
);

const PATHNAME = "/admin/metabot/mcp/authorizations";

const setup = ({
  response = createMockListOAuthAuthorizationsResponse(),
  error = false,
  initialRoute = PATHNAME,
  hasSessionManagement = false,
}: {
  response?: ListOAuthAuthorizationsResponse;
  error?: boolean;
  initialRoute?: string;
  hasSessionManagement?: boolean;
} = {}) => {
  if (error) {
    fetchMock.get("path:/api/oauth/authorizations", { status: 500 });
  } else {
    setupOAuthAuthorizationsEndpoint(response);
  }

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      "session-management": hasSessionManagement,
    }),
  });

  return renderWithProviders(
    <Route path={PATHNAME} element={<OAuthAuthorizationsPage />} />,
    { withRouter: true, initialRoute, storeInitialState: { settings } },
  );
};

const lastCallUrl = () => {
  const calls = fetchMock.callHistory.calls("path:/api/oauth/authorizations");
  return calls[calls.length - 1]?.url ?? "";
};

describe("OAuthAuthorizationsPage", () => {
  it("shows an empty state when no authorizations match", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [],
        total: 0,
      }),
    });

    expect(
      await screen.findByTestId("oauth-authorizations-empty"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it("renders a row per event with client, user, and event type", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({
            client_name: "Claude Code",
            user_email: "user@example.com",
            event_type: "approved",
          }),
        ],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");

    expect(within(table).getByText("Claude Code")).toBeInTheDocument();
    expect(within(table).getByText("user@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Approved")).toBeInTheDocument();
  });

  it("renders the client's redirect URIs", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({
            redirect_uris: [
              "https://app.example.com/cb",
              "https://app.example.com/cb2",
            ],
          }),
        ],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    expect(
      within(table).getByText(
        "https://app.example.com/cb, https://app.example.com/cb2",
      ),
    ).toBeInTheDocument();
  });

  it("renders a registration event with no deciding user", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({
            event_type: "registered",
            user_id: null,
            user_email: null,
          }),
        ],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    expect(within(table).getByText("Registered")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  it("falls back to the client id when there is no client name", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({
            client_name: null,
            client_id: "client-abc",
          }),
        ],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    expect(within(table).getByText("client-abc")).toBeInTheDocument();
  });

  it("renders a denied event", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [createMockOAuthAuthorization({ event_type: "denied" })],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    expect(
      within(table).getByTestId("oauth-event-badge-denied"),
    ).toHaveTextContent("Denied");
  });

  it("renders a revoked event with the revoking admin", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({
            event_type: "revoked",
            user_email: "admin@example.com",
          }),
        ],
        total: 1,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    expect(
      within(table).getByTestId("oauth-event-badge-revoked"),
    ).toHaveTextContent("Revoked");
    expect(within(table).getByText("admin@example.com")).toBeInTheDocument();
  });

  // `--badge-color` is the only DOM signal of a badge's colour. The assertion is
  // comparative so a palette change can't break it: what matters is that a
  // revocation never reads as a user's denial.
  it("colours a revoked event differently from a denied one", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [
          createMockOAuthAuthorization({ id: 1, event_type: "revoked" }),
          createMockOAuthAuthorization({ id: 2, event_type: "denied" }),
        ],
        total: 2,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    const badgeColor = (eventType: string) =>
      within(table)
        .getByTestId(`oauth-event-badge-${eventType}`)
        .style.getPropertyValue("--badge-color");

    expect(badgeColor("revoked")).not.toBe("");
    expect(badgeColor("revoked")).not.toBe(badgeColor("denied"));
  });

  it("does not filter by event type by default", async () => {
    setup();

    await waitFor(() => {
      expect(lastCallUrl()).toContain("/api/oauth/authorizations");
    });
    expect(lastCallUrl()).not.toContain("event-type=");
  });

  it("refetches with the selected event type when the filter changes", async () => {
    setup();

    await screen.findByTestId("oauth-authorizations-table");

    await userEvent.click(screen.getByLabelText("Filter by event"));
    await userEvent.click(await screen.findByText("Denied"));

    await waitFor(() => {
      expect(lastCallUrl()).toContain("event-type=denied");
    });
  });

  it("offers the revoked event type in the filter and requests it", async () => {
    setup();

    await screen.findByTestId("oauth-authorizations-table");

    await userEvent.click(screen.getByLabelText("Filter by event"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Revoked" }),
    );

    await waitFor(() => {
      expect(lastCallUrl()).toContain("event-type=revoked");
    });
  });

  it("requests the next page when paginating", async () => {
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [createMockOAuthAuthorization()],
        total: OAUTH_PAGE_SIZE * 5,
        limit: OAUTH_PAGE_SIZE,
        offset: 0,
      }),
    });

    const nextPage = await screen.findByRole("button", { name: "Next page" });
    await userEvent.click(nextPage);

    await waitFor(() => {
      expect(lastCallUrl()).toContain(`offset=${OAUTH_PAGE_SIZE}`);
    });
  });

  it("links to the Monitor clients page when session management is licensed", async () => {
    setup({ hasSessionManagement: true });

    const link = await screen.findByRole("link", { name: "Manage clients" });
    expect(link).toHaveAttribute("href", "/monitor/oauth-clients");
  });

  it("reports the OAuth clients section when the link is clicked", async () => {
    setup({ hasSessionManagement: true });
    trackMonitorSectionClicked.mockClear();

    await userEvent.click(
      await screen.findByRole("link", { name: "Manage clients" }),
    );

    expect(trackMonitorSectionClicked).toHaveBeenCalledWith("oauth-clients");
  });

  it("does not link to the Monitor clients page without the feature", async () => {
    setup({ hasSessionManagement: false });

    await screen.findByTestId("oauth-authorizations-table");
    expect(
      screen.queryByRole("link", { name: "Manage clients" }),
    ).not.toBeInTheDocument();
  });

  it("does not render any rows when the request fails", async () => {
    setup({ error: true });

    await waitFor(() => {
      expect(lastCallUrl()).toContain("/api/oauth/authorizations");
    });
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("oauth-authorizations-empty"),
    ).not.toBeInTheDocument();
  });
});
