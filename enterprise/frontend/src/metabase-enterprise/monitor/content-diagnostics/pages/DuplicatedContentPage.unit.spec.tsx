import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDuplicatedFindingsEndpoint,
  setupUserKeyValueEndpoints,
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
import * as Urls from "metabase/urls";
import type {
  ContentDiagnosticsDuplicatedFinding,
  ContentDiagnosticsDuplicatedUserParams,
  ListDuplicatedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsDuplicateEntity,
  createMockContentDiagnosticsDuplicatedFinding,
  createMockContentDiagnosticsUser,
  createMockListDuplicatedFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { DuplicatedContentPage } from "./DuplicatedContentPage";

const FINDINGS: ContentDiagnosticsDuplicatedFinding[] = [
  createMockContentDiagnosticsDuplicatedFinding({
    id: 1,
    entity_type: "card",
    entity_display_name: "Sales overview",
    duplicate_count: 2,
  }),
  createMockContentDiagnosticsDuplicatedFinding({
    id: 2,
    entity_type: "dashboard",
    entity_display_name: "Marketing funnel",
    duplicate_count: 5,
  }),
];

type SetupOpts = {
  findings?: ContentDiagnosticsDuplicatedFinding[];
  total?: number;
  urlParams?: Urls.DuplicatedContentParams;
  lastUsedParams?: ContentDiagnosticsDuplicatedUserParams;
  error?: boolean;
  getResponse?: (url: string) => ListDuplicatedFindingsResponse;
};

function setup({
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  error = false,
  getResponse,
}: SetupOpts = {}) {
  if (error) {
    fetchMock.get("path:/api/ee/content-diagnostics/duplicated", {
      status: 500,
      body: { message: "Duplicated scan failed" },
    });
  } else if (getResponse) {
    fetchMock.get("path:/api/ee/content-diagnostics/duplicated", ({ url }) =>
      getResponse(url),
    );
  } else {
    setupListDuplicatedFindingsEndpoint(
      createMockListDuplicatedFindingsResponse({
        data: findings,
        total: total ?? findings.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "duplicated",
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const { history } = renderWithProviders(
    <Route
      path={Urls.duplicatedContent()}
      element={
        <MonitorContent>
          <DuplicatedContentPage />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: Urls.duplicatedContent(urlParams),
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { history };
}

function getLastRequestUrl() {
  return new URL(
    String(
      fetchMock.callHistory.lastCall(
        "path:/api/ee/content-diagnostics/duplicated",
      )?.url,
    ),
    "http://localhost",
  );
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("DuplicatedContentPage", () => {
  it("renders duplicated findings with their duplicate counts in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(await within(list).findByText("Sales overview")).toBeInTheDocument();
    expect(within(list).getByText("Marketing funnel")).toBeInTheDocument();
    expect(within(list).getByText("2")).toBeInTheDocument();
    expect(within(list).getByText("5")).toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    setup({ findings: [] });

    expect(
      await screen.findByText("No duplicated content found"),
    ).toBeInTheDocument();
  });

  it("renders the selected finding details and its duplicates in the sidebar", async () => {
    const finding = createMockContentDiagnosticsDuplicatedFinding({
      entity_id: 42,
      entity_display_name: "Revenue by category",
      duplicate_count: 2,
      details: {
        collection: createMockContentDiagnosticsCollection({
          id: 20,
          name: "Executive dashboards",
          effective_ancestors: [{ id: "root", name: "Our analytics" }],
        }),
        description: "Shows revenue grouped by product category.",
        creator: createMockContentDiagnosticsUser({ name: "Grace Creator" }),
        view_count: 7,
        duplicate_entities: [
          createMockContentDiagnosticsDuplicateEntity({
            id: 43,
            name: "Revenue by Category",
            entity_type: "card",
            card_type: "model",
            view_count: 3,
          }),
          createMockContentDiagnosticsDuplicateEntity({
            id: 44,
            name: "revenue by category",
            entity_type: "card",
            view_count: 1,
          }),
        ],
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Revenue by category"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Revenue by category");
    expect(sidebarRegion).toHaveTextContent("Executive dashboards");
    expect(sidebarRegion).toHaveTextContent(
      "Shows revenue grouped by product category.",
    );
    expect(sidebarRegion).toHaveTextContent("Grace Creator");

    const duplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(within(duplicates).getByText("Duplicates (2)")).toBeInTheDocument();
    expect(
      within(duplicates).getByRole("link", {
        name: "Revenue by Category, Model",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/model/43"));
    expect(
      within(duplicates).getByRole("link", {
        name: "revenue by category, Question",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/question/44"));
    expect(within(duplicates).getByText("3 views")).toBeInTheDocument();
    expect(within(duplicates).getByText("1 view")).toBeInTheDocument();
  });

  it("renders a collection finding and its collection duplicate", async () => {
    const finding = createMockContentDiagnosticsDuplicatedFinding({
      entity_type: "collection",
      entity_id: 54,
      entity_display_name: "Reporting",
      duplicate_count: 1,
      details: {
        view_count: undefined,
        duplicate_entities: [
          createMockContentDiagnosticsDuplicateEntity({
            id: 55,
            name: "reporting",
            entity_type: "collection",
            view_count: undefined,
          }),
        ],
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    const row = await within(list).findByRole("row", { name: /Reporting/ });
    expect(within(row).getByText("Collection")).toBeInTheDocument();

    await userEvent.click(within(row).getByText("Reporting"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    const duplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(
      within(duplicates).getByRole("link", { name: "reporting, Collection" }),
    ).toHaveAttribute("href", expect.stringContaining("/collection/55"));
    expect(within(duplicates).queryByText(/view/)).not.toBeInTheDocument();
  });

  it("tells the user when none of the duplicates are visible to them", async () => {
    const finding = createMockContentDiagnosticsDuplicatedFinding({
      entity_display_name: "Hidden peers",
      duplicate_count: 3,
      details: { duplicate_entities: [] },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Hidden peers"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Duplicates (3)");
    expect(sidebarRegion).toHaveTextContent(
      "None of these duplicates are visible to you.",
    );
  });

  it("tells the user when only some of the duplicates are visible to them", async () => {
    const finding = createMockContentDiagnosticsDuplicatedFinding({
      entity_display_name: "Partially hidden peers",
      duplicate_count: 3,
      details: {
        duplicate_entities: [
          createMockContentDiagnosticsDuplicateEntity({
            id: 43,
            name: "Visible peer",
          }),
        ],
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(
      await within(list).findByText("Partially hidden peers"),
    );

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    const duplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(within(duplicates).getByText("Duplicates (3)")).toBeInTheDocument();
    expect(
      within(duplicates).getByRole("link", { name: "Visible peer, Question" }),
    ).toBeInTheDocument();
    expect(
      within(duplicates).getByText("2 duplicates aren't visible to you."),
    ).toBeInTheDocument();
  });

  it("sends table sort changes to the server and URL", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByRole("columnheader", { name: /^Duplicates/ }),
    );

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        "duplicate-count",
      );
    });
    expect(getLastRequestUrl().searchParams.get("sort-direction")).toBe("asc");
    expect(history?.getCurrentLocation().query).toEqual({
      "sort-column": "duplicate-count",
      "sort-direction": "asc",
    });
  });

  it("refetches the duplicated endpoint with the next offset and renders the next page", async () => {
    const secondPageFinding = createMockContentDiagnosticsDuplicatedFinding({
      id: 3,
      entity_display_name: "Second page question",
    });
    const { history } = setup({
      total: 50,
      getResponse: (url) =>
        createMockListDuplicatedFindingsResponse({
          data: url.includes("offset=25") ? [secondPageFinding] : FINDINGS,
          total: 50,
        }),
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(await screen.findByText("Second page question")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().query).toEqual({ page: "1" });
    expect(getLastRequestUrl().searchParams.get("limit")).toBe("25");
    expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
  });

  it("resets pagination when table sorting changes", async () => {
    const { history } = setup({
      findings: FINDINGS,
      total: 50,
      urlParams: { page: 1 },
    });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");

    await userEvent.click(
      screen.getByRole("columnheader", { name: /^Duplicates/ }),
    );

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("0");
    });
    expect(history?.getCurrentLocation().query).toEqual({
      "sort-column": "duplicate-count",
      "sort-direction": "asc",
    });
  });

  it("filters by personal collections server-side via the Location toggle", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("true");

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      }),
    );

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({
        "include-personal-collections": "false",
      });
    });
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("false");
  });

  it("sends the minimum duplicate count picked in the Filter popover and clears it again", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByPlaceholderText("Any number of duplicates"),
    );
    await userEvent.click(
      await within(popover).findByRole("option", { name: "5 or more" }),
    );

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({
        "min-duplicate-count": "5",
      });
    });
    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "5",
    );

    await userEvent.click(within(popover).getByLabelText("Clear"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({});
    });
    expect(
      within(popover).getByPlaceholderText("Any number of duplicates"),
    ).toHaveValue("");
  });

  it("sends the minimum duplicate count filter to the server and reflects it in the Filter popover", async () => {
    setup({ findings: FINDINGS, urlParams: { minDuplicateCount: 3 } });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "3",
    );

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByDisplayValue("3 or more")).toBeInTheDocument();
  });

  it("sends the query parameter to the server when searching", async () => {
    setup({
      getResponse: (url) =>
        createMockListDuplicatedFindingsResponse({
          data: url.includes("query=sales") ? [FINDINGS[0]] : FINDINGS,
          total: url.includes("query=sales") ? 1 : FINDINGS.length,
        }),
    });
    await waitForListToLoad();

    const input = screen.getByTestId("content-diagnostics-search-input");
    await userEvent.type(input, "sales");

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("sales");
  });

  it("offers collections as an entity type and sends the selection to the server", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Collections" }),
    );

    const expectedTypes = [
      "question",
      "model",
      "metric",
      "dashboard",
      "document",
      "transform",
    ];

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({
        "entity-types": expectedTypes,
      });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual(
      expectedTypes,
    );
  });

  it("shows the error state and suppresses the table when the request fails", async () => {
    setup({ error: true });

    expect(
      await screen.findByText("Duplicated scan failed"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { min_duplicate_count: 5 },
    });

    await waitForListToLoad();

    expect(history?.getCurrentLocation().query).toEqual({
      "min-duplicate-count": "5",
    });
    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "5",
    );
  });
});
