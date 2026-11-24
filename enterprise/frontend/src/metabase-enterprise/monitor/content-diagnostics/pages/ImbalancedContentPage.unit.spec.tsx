import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentType } from "react";

import {
  setupContentDiagnosticsCountsEndpoint,
  setupInvalidateFindingsEndpoint,
  setupListImbalancedFindingsEndpoint,
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
import type { UrlStateQuery } from "metabase/common/hooks/use-url-state";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route, queryToSearch } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedUnit,
  ContentDiagnosticsImbalancedUserParams,
  ListImbalancedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsImbalancedFinding,
  createMockContentDiagnosticsUser,
  createMockListImbalancedFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  CrowdedContentPage,
  EmptyContentPage,
  SparseContentPage,
} from "./ImbalancedContentPage";

const PAGE_BY_MODE: Record<
  ContentDiagnosticsImbalancedFindingType,
  ComponentType
> = {
  empty: EmptyContentPage,
  sparse: SparseContentPage,
  crowded: CrowdedContentPage,
};

const FINDINGS: ContentDiagnosticsImbalancedFinding[] = [
  createMockContentDiagnosticsImbalancedFinding({
    id: 1,
    finding_type: "crowded",
    entity_type: "collection",
    entity_display_name: "Crowded collection",
    content_count: 150,
  }),
  createMockContentDiagnosticsImbalancedFinding({
    id: 2,
    finding_type: "crowded",
    entity_type: "dashboard",
    entity_display_name: "Busy dashboard",
    content_count: 42,
  }),
];

type SetupOpts = {
  mode?: ContentDiagnosticsImbalancedFindingType;
  findings?: ContentDiagnosticsImbalancedFinding[];
  total?: number;
  urlParams?: UrlStateQuery;
  lastUsedParams?: ContentDiagnosticsImbalancedUserParams;
  error?: boolean;
  getResponse?: (url: string) => ListImbalancedFindingsResponse;
};

function setup({
  mode = "crowded",
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  error = false,
  getResponse,
}: SetupOpts = {}) {
  if (error) {
    fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", {
      status: 500,
      body: { message: "Imbalanced scan failed" },
    });
  } else if (getResponse) {
    fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", ({ url }) =>
      getResponse(url),
    );
  } else {
    setupListImbalancedFindingsEndpoint(
      createMockListImbalancedFindingsResponse({
        data: findings,
        total: total ?? findings.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: mode,
    value: lastUsedParams,
  });

  setupContentDiagnosticsCountsEndpoint();
  mockGetBoundingClientRect({ width: 100, height: 100 });

  const Page = PAGE_BY_MODE[mode];
  const { router } = renderWithProviders(
    <Route
      path={Urls.imbalancedContent(mode)}
      element={
        <MonitorContent>
          <Page />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: `${Urls.imbalancedContent(mode)}${queryToSearch(urlParams)}`,
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
        "path:/api/ee/content-diagnostics/imbalanced",
      )?.url,
    ),
    "http://localhost",
  );
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("ImbalancedContentPage", () => {
  it("renders findings with their content counts in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(
      await within(list).findByText("Crowded collection"),
    ).toBeInTheDocument();
    expect(within(list).getByText("Busy dashboard")).toBeInTheDocument();
    expect(within(list).getByText("150")).toBeInTheDocument();
    expect(within(list).getByText("42")).toBeInTheDocument();
  });

  it.each(["empty", "sparse"] as const)(
    "offers bulk-trash selection on the %s tab",
    async (mode) => {
      setup({
        mode,
        findings: [
          createMockContentDiagnosticsImbalancedFinding({ can_write: true }),
        ],
      });

      await screen.findByRole("treegrid");
      expect(await screen.findByLabelText("Select all")).toBeInTheDocument();
    },
  );

  it("offers dismissal without trash on the Crowded tab", async () => {
    setupInvalidateFindingsEndpoint({
      invalidated: [11],
      skipped: [],
    });
    setup({
      mode: "crowded",
      findings: [
        createMockContentDiagnosticsImbalancedFinding({
          id: 11,
          entity_id: 101,
          can_write: false,
        }),
      ],
    });

    await screen.findByRole("treegrid");
    await userEvent.click(screen.getByLabelText("Select all"));
    expect(
      screen.getByRole("button", { name: "Dismiss finding" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss finding" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Dismiss finding",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("content-diagnostics-bulk-actions"),
      ).not.toBeInTheDocument(),
    );
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/content-diagnostics/invalidate",
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    const body: unknown = JSON.parse(String(call.options.body));
    expect(body).toEqual({ ids: [11] });
  });

  it("pins the finding type to the tab's problem type", async () => {
    setup({ mode: "crowded", findings: FINDINGS });
    await waitForListToLoad();
    expect(getLastRequestUrl().searchParams.getAll("finding-types")).toEqual([
      "crowded",
    ]);
  });

  it("pins a different finding type for another tab", async () => {
    setup({ mode: "empty", findings: [] });
    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.getAll("finding-types")).toEqual([
        "empty",
      ]);
    });
  });

  it("shows a problem-specific empty state", async () => {
    setup({ mode: "sparse", findings: [] });

    expect(
      await screen.findByText("No sparse content found"),
    ).toBeInTheDocument();
  });

  it("renders the content count in the sidebar", async () => {
    const finding = createMockContentDiagnosticsImbalancedFinding({
      id: 1,
      finding_type: "crowded",
      entity_type: "collection",
      entity_id: 20,
      entity_display_name: "Executive dashboards",
      content_count: 150,
      details: {
        collection: createMockContentDiagnosticsCollection({
          id: 30,
          name: "Reporting",
        }),
        creator: createMockContentDiagnosticsUser({ name: "Grace Creator" }),
        threshold: 100,
        unit: "items",
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(
      await within(list).findByText("Executive dashboards"),
    );

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Grace Creator");
    expect(sidebarRegion).toHaveTextContent("150 items");
  });

  describe("sidebar content count per entity type", () => {
    type CountCase = {
      entityType: ContentDiagnosticsImbalancedFinding["entity_type"];
      entityId: number;
      name: string;
      count: number;
      unit: ContentDiagnosticsImbalancedUnit;
      label: string;
    };

    // The same dashboard (entity 32) is crowded on tabs and empty on dashcards at once: the
    // checkers run independently, so one entity can be reported on more than one tab.
    const CASES: Record<ContentDiagnosticsImbalancedFindingType, CountCase[]> =
      {
        empty: [
          {
            entityType: "collection",
            entityId: 11,
            name: "Bare collection",
            count: 0,
            unit: "items",
            label: "0 items",
          },
          {
            entityType: "dashboard",
            entityId: 32,
            name: "Tabbed dashboard",
            count: 0,
            unit: "dashcards",
            label: "0 dashcards",
          },
          {
            entityType: "document",
            entityId: 13,
            name: "Blank document",
            count: 0,
            unit: "cards",
            label: "0 cards",
          },
          {
            entityType: "card",
            entityId: 14,
            name: "Rowless question",
            count: 0,
            unit: "rows",
            label: "0 rows",
          },
        ],
        sparse: [
          {
            entityType: "collection",
            entityId: 21,
            name: "Thin collection",
            count: 2,
            unit: "items",
            label: "2 items",
          },
          {
            entityType: "dashboard",
            entityId: 22,
            name: "Thin dashboard",
            count: 1,
            unit: "dashcards",
            label: "1 dashcard",
          },
        ],
        crowded: [
          {
            entityType: "collection",
            entityId: 31,
            name: "Crowded collection",
            count: 3,
            unit: "items",
            label: "3 items",
          },
          {
            entityType: "dashboard",
            entityId: 32,
            name: "Tabbed dashboard",
            count: 2,
            unit: "tabs",
            label: "2 tabs",
          },
          {
            entityType: "dashboard",
            entityId: 33,
            name: "Packed dashboard",
            count: 2,
            unit: "dashcards",
            label: "2 dashcards on one tab",
          },
          {
            entityType: "document",
            entityId: 34,
            name: "Crowded document",
            count: 2,
            unit: "cards",
            label: "2 cards",
          },
        ],
      };

    function toFinding(
      mode: ContentDiagnosticsImbalancedFindingType,
      { entityType, entityId, name, count, unit }: CountCase,
      index: number,
    ) {
      return createMockContentDiagnosticsImbalancedFinding({
        id: index + 1,
        finding_type: mode,
        entity_type: entityType,
        entity_id: entityId,
        entity_display_name: name,
        content_count: count,
        details: { threshold: 1, unit },
      });
    }

    it.each(["empty", "sparse", "crowded"] as const)(
      "counts each %s finding in the unit it was measured in",
      async (mode) => {
        const cases = CASES[mode];
        setup({
          mode,
          getResponse: (url) => {
            const params = new URL(url, "http://localhost").searchParams;
            const isTabType =
              params.getAll("finding-types").join() === String(mode);
            const data = isTabType
              ? cases.map((testCase, index) => toFinding(mode, testCase, index))
              : [];
            return createMockListImbalancedFindingsResponse({
              data,
              total: data.length,
            });
          },
        });

        const list = await screen.findByRole("treegrid");
        // Open the findings last to first, so a sidebar stuck on the first row fails.
        for (const { name, label } of [...cases].reverse()) {
          await userEvent.click(await within(list).findByText(name));

          const sidebar = await screen.findByRole("region", {
            name: `Details for ${name}`,
          });
          const info = within(sidebar).getByRole("region", { name: "Info" });
          expect(within(info).getByText("Content count")).toBeVisible();
          expect(within(info).getByText(label)).toBeVisible();
        }
      },
    );
  });

  it("offers collections as an entity type and sends the selection to the server", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    const collectionsCheckbox = within(popover).getByRole("checkbox", {
      name: "Collections",
    });
    expect(collectionsCheckbox).not.toBeChecked();

    await userEvent.click(collectionsCheckbox);

    const expectedTypes = ["dashboard", "collection"];
    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({ "entity-types": expectedTypes });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual(
      expectedTypes,
    );
  });

  it("sends the query parameter to the server when searching", async () => {
    setup({
      getResponse: (url) =>
        createMockListImbalancedFindingsResponse({
          data: url.includes("query=busy") ? [FINDINGS[1]] : FINDINGS,
          total: url.includes("query=busy") ? 1 : FINDINGS.length,
        }),
    });
    await waitForListToLoad();

    const input = screen.getByLabelText("Search");
    await userEvent.type(input, "busy");

    await waitFor(() => {
      expect(screen.queryByText("Crowded collection")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Busy dashboard")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("busy");
  });

  it("shows the error state and doesn't render the table when the request fails", async () => {
    setup({ error: true });

    expect(
      await screen.findByText("Imbalanced scan failed"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { sort_column: "created-at", sort_direction: "desc" },
    });

    await waitForListToLoad();

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "desc",
      });
    });
    expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
      "created-at",
    );
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
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
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
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "dashboard",
    ]);
  });

  it("resets to all entity types when the last selected type is deselected", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    const allEntityTypes = ["Dashboards", "Documents", "Collections"];
    allEntityTypes.forEach((label) => {
      expect(
        within(popover).getByRole("checkbox", { name: label }),
      ).toBeChecked();
    });
  });
  describe("sorting", () => {
    it("does not offer sorting by mixed-unit crowded content counts", async () => {
      const { router } = setup({
        findings: FINDINGS,
        urlParams: { "sort-column": "content-count" },
      });
      await waitForListToLoad();

      const header = screen.getByRole("columnheader", {
        name: /^Content count/,
      });
      expect(header).not.toHaveAttribute("aria-sort");
      await userEvent.click(header);
      expect(getUrlQuery(router)).toEqual({});
    });

    it("sorts empty content by its comparable count", async () => {
      const { router } = setup({ mode: "empty", findings: FINDINGS });
      await waitForListToLoad();

      await userEvent.click(
        screen.getByRole("columnheader", { name: /^Content count/ }),
      );
      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({
          "sort-column": "content-count",
          "sort-direction": "asc",
        });
      });
    });
    it.each([
      ["Name", "name"],
      ["Type", "entity-type"],
      ["Location", "collection-name"],
      ["Created by", "created-by"],
      ["Created at", "created-at"],
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
  });
});
