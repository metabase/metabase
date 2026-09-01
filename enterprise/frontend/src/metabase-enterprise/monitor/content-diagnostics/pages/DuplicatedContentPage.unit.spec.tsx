import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDuplicatedFindingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  type TestRouter,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
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

  const { router } = renderWithProviders(
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

  return { router };
}

function getUrlQuery(router: TestRouter | undefined) {
  return parseSearchQuery(router?.location.search ?? "");
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

  it("renders sidebar details for card and collection findings", async () => {
    const cardFinding = createMockContentDiagnosticsDuplicatedFinding({
      id: 1,
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
    const collectionFinding = createMockContentDiagnosticsDuplicatedFinding({
      id: 2,
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
    setup({ findings: [cardFinding, collectionFinding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Revenue by category"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Revenue by category");
    expect(sidebarRegion).toHaveTextContent("Executive dashboards");
    expect(sidebarRegion).toHaveTextContent(
      "Shows revenue grouped by product category.",
    );
    expect(sidebarRegion).toHaveTextContent("Grace Creator");

    const cardDuplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(
      within(cardDuplicates).getByText("Duplicates (2)"),
    ).toBeInTheDocument();
    expect(
      within(cardDuplicates).getByRole("link", {
        name: "Revenue by Category, Model",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/model/43"));
    expect(
      within(cardDuplicates).getByRole("link", {
        name: "revenue by category, Question",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/question/44"));
    expect(within(cardDuplicates).getByText("3 views")).toBeInTheDocument();
    expect(within(cardDuplicates).getByText("1 view")).toBeInTheDocument();

    const collectionRow = within(list).getByRole("row", { name: /Reporting/ });
    expect(within(collectionRow).getByText("Collection")).toBeInTheDocument();
    await userEvent.click(within(collectionRow).getByText("Reporting"));

    const collectionDuplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(
      await within(collectionDuplicates).findByRole("link", {
        name: "reporting, Collection",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/collection/55"));
    expect(
      within(collectionDuplicates).queryByText(/view/),
    ).not.toBeInTheDocument();
  });

  it("reports duplicates that aren't visible to the user", async () => {
    const noneVisible = createMockContentDiagnosticsDuplicatedFinding({
      id: 1,
      entity_display_name: "Hidden peers",
      duplicate_count: 3,
      details: { duplicate_entities: [] },
    });
    const someVisible = createMockContentDiagnosticsDuplicatedFinding({
      id: 2,
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
    setup({ findings: [noneVisible, someVisible] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Hidden peers"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Duplicates (3)");
    expect(sidebarRegion).toHaveTextContent(
      "None of these duplicates are visible to you.",
    );

    await userEvent.click(within(list).getByText("Partially hidden peers"));

    const duplicates = within(sidebarRegion).getByRole("region", {
      name: "Duplicates",
    });
    expect(
      await within(duplicates).findByRole("link", {
        name: "Visible peer, Question",
      }),
    ).toBeInTheDocument();
    expect(within(duplicates).getByText("Duplicates (3)")).toBeInTheDocument();
    expect(
      within(duplicates).getByText("2 duplicates aren't visible to you."),
    ).toBeInTheDocument();
  });

  it("sends table sort changes to the server and URL, resetting pagination", async () => {
    const { router } = setup({
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
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        "duplicate-count",
      );
    });
    expect(getLastRequestUrl().searchParams.get("sort-direction")).toBe("asc");
    expect(getLastRequestUrl().searchParams.get("offset")).toBe("0");
    expect(getUrlQuery(router)).toEqual({
      "sort-column": "duplicate-count",
      "sort-direction": "asc",
    });
  });

  it("refetches the duplicated endpoint with the next offset and renders the next page", async () => {
    const secondPageFinding = createMockContentDiagnosticsDuplicatedFinding({
      id: 3,
      entity_display_name: "Second page question",
    });
    const { router } = setup({
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
    expect(getUrlQuery(router)).toEqual({ page: "1" });
    expect(getLastRequestUrl().searchParams.get("limit")).toBe("25");
    expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
  });

  it("filters by personal collections server-side", async () => {
    const { router } = setup({ findings: FINDINGS });
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
      expect(getUrlQuery(router)).toEqual({
        "include-personal-collections": "false",
      });
    });
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("false");
  });

  it("reflects the minimum duplicate count from the URL and sends changes made in the Filter popover", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { minDuplicateCount: 3 },
    });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "3",
    );

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    const input = within(popover).getByDisplayValue("3 or more");

    await userEvent.click(input);
    await userEvent.click(
      await within(popover).findByRole("option", { name: "5 or more" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "min-duplicate-count": "5",
      });
    });
    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "5",
    );

    await userEvent.click(within(popover).getByLabelText("Clear"));

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    expect(
      within(popover).getByPlaceholderText("Any number of duplicates"),
    ).toHaveValue("");
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

    const input = screen.getByLabelText("Search");
    await userEvent.type(input, "sales");

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("sales");
  });

  it("offers collections as an entity type and sends the selection to the server", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["question"] },
    });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "question",
    ]);

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    const collectionsCheckbox = within(popover).getByRole("checkbox", {
      name: "Collections",
    });
    expect(collectionsCheckbox).not.toBeChecked();

    await userEvent.click(collectionsCheckbox);

    const expectedTypes = ["question", "collection"];

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "entity-types": expectedTypes,
      });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual(
      expectedTypes,
    );
    expect(collectionsCheckbox).toBeChecked();
  });

  it("shows the error state and doesn't render the table when request fails", async () => {
    setup({ error: true });

    expect(
      await screen.findByText("Duplicated scan failed"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { min_duplicate_count: 5 },
    });

    await waitForListToLoad();

    expect(getUrlQuery(router)).toEqual({
      "min-duplicate-count": "5",
    });
    expect(getLastRequestUrl().searchParams.get("min-duplicate-count")).toBe(
      "5",
    );
  });

  it("lets an explicit default-valued URL win over the last-used filter", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { page: 0, includePersonalCollections: true },
      lastUsedParams: { min_duplicate_count: 5 },
    });

    await waitForListToLoad();

    expect(
      getLastRequestUrl().searchParams.get("min-duplicate-count"),
    ).toBeNull();
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("true");
    expect(getUrlQuery(router)).toEqual({});
  });
  it("marks the filter button once non-default filters are applied", async () => {
    setup({ findings: FINDINGS });
    await waitForListToLoad();

    expect(
      screen.queryByTestId("content-diagnostics-filter-indicator"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Models" }),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("content-diagnostics-filter-indicator"),
      ).toBeInTheDocument();
    });
  });

  it("keeps the active filters when moving to the next page", async () => {
    setup({
      findings: FINDINGS,
      total: 50,
      urlParams: { entityTypes: ["model"] },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "model",
    ]);
  });

  it("resets to all entity types when the last selected type is deselected", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["model"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Models" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    const allEntityTypes = [
      "Questions",
      "Models",
      "Metrics",
      "Dashboards",
      "Documents",
      "Transforms",
      "Collections",
    ];
    allEntityTypes.forEach((label) => {
      expect(
        within(popover).getByRole("checkbox", { name: label }),
      ).toBeChecked();
    });
  });
  describe("sorting", () => {
    it.each([
      ["Name", "name"],
      ["Type", "entity-type"],
      ["Created by", "created-by"],
      ["Created at", "created-at"],
      ["Duplicates", "duplicate-count"],
    ])("sorts by %s", async (header, sortColumn) => {
      const { router } = setup({ findings: FINDINGS });
      await waitForListToLoad();

      await userEvent.click(
        screen.getByRole("columnheader", { name: new RegExp(`^${header}`) }),
      );

      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({
          "sort-column": sortColumn,
          "sort-direction": "asc",
        });
      });
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        sortColumn,
      );
    });

    it("cycles a column through ascending, descending and unsorted", async () => {
      const { router } = setup({ findings: FINDINGS });
      await waitForListToLoad();

      const header = () =>
        screen.getByRole("columnheader", { name: /^Created at/ });

      await userEvent.click(header());
      await waitFor(() => {
        expect(header()).toHaveAttribute("aria-sort", "ascending");
      });
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "asc",
      });

      await userEvent.click(header());
      await waitFor(() => {
        expect(header()).toHaveAttribute("aria-sort", "descending");
      });
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "desc",
      });

      await userEvent.click(header());
      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({});
      });
      expect(header()).not.toHaveAttribute("aria-sort");
    });

    it("does not offer sorting by Location", async () => {
      setup({ findings: FINDINGS });
      await waitForListToLoad();

      expect(
        screen.getByRole("columnheader", { name: /^Location/ }),
      ).not.toHaveAttribute("tabindex");
    });
  });
});
