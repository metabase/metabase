import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentType } from "react";

import {
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
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
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
  urlParams?: Urls.ImbalancedContentParams;
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
      initialRoute: Urls.imbalancedContent(mode, urlParams),
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

  it("has no bulk-trash selection on the Crowded tab", async () => {
    setup({
      mode: "crowded",
      findings: [
        createMockContentDiagnosticsImbalancedFinding({ can_write: true }),
      ],
    });

    await screen.findByRole("treegrid");
    expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
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

  it("offers collections as an entity type and sends the selection to the server", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["dashboard"] },
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
      lastUsedParams: { sort_column: "content-count", sort_direction: "desc" },
    });

    await waitForListToLoad();

    expect(getUrlQuery(router)).toEqual({
      "sort-column": "content-count",
      "sort-direction": "desc",
    });
    expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
      "content-count",
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
      ["Content count", "content-count"],
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
