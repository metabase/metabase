import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import { setupOAuthAuthorizationsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { ListOAuthAuthorizationsResponse } from "metabase-types/api";
import {
  createMockListOAuthAuthorizationsResponse,
  createMockOAuthAuthorization,
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

const PATHNAME = "/admin/metabot/mcp/authorizations";

const setup = ({
  response = createMockListOAuthAuthorizationsResponse(),
  error = false,
  initialRoute = PATHNAME,
}: {
  response?: ListOAuthAuthorizationsResponse;
  error?: boolean;
  initialRoute?: string;
} = {}) => {
  if (error) {
    fetchMock.get("path:/api/oauth/authorizations", { status: 500 });
  } else {
    setupOAuthAuthorizationsEndpoint(response);
  }

  return renderWithProviders(
    <Route path={PATHNAME} element={<OAuthAuthorizationsPage />} />,
    { withRouter: true, initialRoute },
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
    expect(within(table).getByText("Denied")).toBeInTheDocument();
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

  it("ties each event to its client and user, and shows only the events of the selected type", async () => {
    const registeredA = createMockOAuthAuthorization({
      id: 1,
      client_name: "MCP Client A",
      event_type: "registered",
      user_id: null,
      user_email: null,
      redirect_uris: ["https://a.example.com/callback"],
    });
    const registeredB = createMockOAuthAuthorization({
      id: 2,
      client_name: "MCP Client B",
      event_type: "registered",
      user_id: null,
      user_email: null,
      redirect_uris: ["https://b.example.com/callback"],
    });
    const registeredC = createMockOAuthAuthorization({
      id: 3,
      client_name: "MCP Client C",
      event_type: "registered",
      user_id: null,
      user_email: null,
      redirect_uris: ["https://c.example.com/callback"],
    });
    const approvedB = createMockOAuthAuthorization({
      id: 4,
      client_name: "MCP Client B",
      event_type: "approved",
      user_email: "approver@example.com",
      redirect_uris: ["https://b.example.com/callback"],
    });
    const deniedC = createMockOAuthAuthorization({
      id: 5,
      client_name: "MCP Client C",
      event_type: "denied",
      user_email: "denier@example.com",
      redirect_uris: ["https://c.example.com/callback"],
    });

    setupOAuthAuthorizationsEndpoint(
      createMockListOAuthAuthorizationsResponse({
        data: [approvedB],
        total: 1,
      }),
      { query: { "event-type": "approved" } },
    );
    setup({
      response: createMockListOAuthAuthorizationsResponse({
        data: [deniedC, approvedB, registeredC, registeredB, registeredA],
        total: 5,
      }),
    });

    const table = await screen.findByTestId("oauth-authorizations-table");
    const rowWith = (...texts: string[]) =>
      within(table)
        .getAllByRole("row")
        .filter((row) =>
          texts.every((text) => row.textContent?.includes(text)),
        );

    expect(
      rowWith("MCP Client A", "Registered", "https://a.example.com/callback"),
    ).toHaveLength(1);
    expect(rowWith("MCP Client B", "Registered")).toHaveLength(1);
    expect(rowWith("MCP Client C", "Registered")).toHaveLength(1);
    expect(
      rowWith("MCP Client B", "Approved", "approver@example.com"),
    ).toHaveLength(1);
    expect(
      rowWith("MCP Client C", "Denied", "denier@example.com"),
    ).toHaveLength(1);

    await userEvent.click(screen.getByLabelText("Filter by event"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Approved" }),
    );

    await waitFor(() => {
      expect(within(table).queryByText("Registered")).not.toBeInTheDocument();
    });
    expect(lastCallUrl()).toContain("event-type=approved");
    expect(within(table).getAllByRole("row")).toHaveLength(1);
    expect(
      rowWith("MCP Client B", "Approved", "approver@example.com"),
    ).toHaveLength(1);
    expect(within(table).queryByText("Denied")).not.toBeInTheDocument();
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
