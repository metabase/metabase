import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDuplicatedFindingsEndpoint,
  setupListImbalancedFindingsEndpoint,
  setupListSlowFindingsEndpoint,
  setupListStaleFindingsEndpoint,
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
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ContentDiagnosticsStaleFinding,
  ListImbalancedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsImbalancedFinding,
  createMockListDuplicatedFindingsResponse,
  createMockListImbalancedFindingsResponse,
  createMockListSlowFindingsResponse,
  createMockListStaleFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { getContentDiagnosticsRoutes } from "./routes";

interface SetupOpts {
  findings?: ContentDiagnosticsStaleFinding[];
  total?: number;
  initialRoute?: string;
  getImbalancedResponse?: (
    url: string,
  ) => ListImbalancedFindingsResponse | Promise<ListImbalancedFindingsResponse>;
}

function setup({
  findings = [],
  total = findings.length,
  initialRoute = Urls.staleContent(),
  getImbalancedResponse = () =>
    createMockListImbalancedFindingsResponse({ data: [], total: 0 }),
}: SetupOpts = {}) {
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({ data: findings, total }),
  );
  setupListDuplicatedFindingsEndpoint(
    createMockListDuplicatedFindingsResponse({ data: [], total: 0 }),
  );
  setupListSlowFindingsEndpoint(
    createMockListSlowFindingsResponse({ data: [], total: 0 }),
  );
  setupListImbalancedFindingsEndpoint(({ url }) => getImbalancedResponse(url));
  for (const key of [
    "stale",
    "duplicated",
    "slow",
    "empty",
    "sparse",
    "crowded",
  ] as const) {
    setupUserKeyValueEndpoints({
      namespace: "content_diagnostics",
      key,
      value: {},
    });
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route
      path={Urls.contentDiagnostics()}
      element={
        <MonitorContent>
          <Outlet />
        </MonitorContent>
      }
    >
      {getContentDiagnosticsRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: { currentUser: createMockUser() },
    },
  );
}

const getTab = (name: string) => screen.getByRole("link", { name });

describe("content diagnostics tab state", () => {
  const EMPTY_FINDINGS = [
    createMockContentDiagnosticsImbalancedFinding({
      id: 1,
      finding_type: "empty",
      entity_type: "dashboard",
      entity_id: 11,
      entity_display_name: "Blank orders dashboard",
      content_count: 0,
    }),
    createMockContentDiagnosticsImbalancedFinding({
      id: 2,
      finding_type: "empty",
      entity_type: "collection",
      entity_id: 12,
      entity_display_name: "Blank orders collection",
      content_count: 0,
    }),
  ];
  const SPARSE_FINDING = createMockContentDiagnosticsImbalancedFinding({
    id: 3,
    finding_type: "sparse",
    entity_type: "dashboard",
    entity_id: 13,
    entity_display_name: "Thin dashboard",
    content_count: 1,
  });
  const SPARSE_RESPONSE_DELAY = 200;

  const getImbalancedResponse = (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const query = params.get("query")?.toLowerCase();
    const entityTypes = params.getAll("entity-types");
    const findingTypes = params.getAll("finding-types");

    if (findingTypes.length === 1 && findingTypes[0] === "empty") {
      const data = EMPTY_FINDINGS.filter(
        (finding) =>
          (query == null ||
            (finding.entity_display_name ?? "")
              .toLowerCase()
              .includes(query)) &&
          (entityTypes.length === 0 ||
            entityTypes.includes(finding.entity_type)),
      );
      return createMockListImbalancedFindingsResponse({
        data,
        total: data.length,
      });
    }

    // The neighbouring tab only gets its finding back for an unfiltered request. The response is
    // delayed so the assertions made right after switching tabs run before it arrives.
    const isCleanSparseRequest =
      findingTypes.length === 1 &&
      findingTypes[0] === "sparse" &&
      query == null &&
      entityTypes.length === 0;
    const data = isCleanSparseRequest ? [SPARSE_FINDING] : [];
    return new Promise<ListImbalancedFindingsResponse>((resolve) =>
      setTimeout(
        () =>
          resolve(
            createMockListImbalancedFindingsResponse({
              data,
              total: data.length,
            }),
          ),
        SPARSE_RESPONSE_DELAY,
      ),
    );
  };

  it("starts a neighbouring tab clean, with no search, filters or sidebar", async () => {
    setup({
      initialRoute: Urls.imbalancedContent("empty"),
      getImbalancedResponse,
    });
    const list = await screen.findByRole("treegrid");
    expect(
      await within(list).findByText("Blank orders dashboard"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search"), "orders");
    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/ee/content-diagnostics/imbalanced")
          .some(
            (call) => new URL(call.url).searchParams.get("query") === "orders",
          ),
      ).toBe(true);
    });

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("checkbox", {
        name: "Dashboards",
      }),
    );
    await waitFor(() => {
      expect(
        within(list).queryByText("Blank orders dashboard"),
      ).not.toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await userEvent.click(within(list).getByText("Blank orders collection"));
    const sidebar = await screen.findByTestId("content-diagnostics-sidebar");
    expect(sidebar).toHaveTextContent("Blank orders collection");
    expect(screen.getByLabelText("Search")).toHaveValue("orders");
    expect(
      screen.getByTestId("content-diagnostics-filter-indicator"),
    ).toBeInTheDocument();

    await userEvent.click(getTab("Sparse"));

    // Before the neighbouring tab's findings arrive.
    expect(
      screen.queryByTestId("content-diagnostics-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");

    expect(await screen.findByText("Thin dashboard")).toBeInTheDocument();
    expect(
      screen.queryByTestId("content-diagnostics-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(
      screen.getByTestId("content-diagnostics-filter-button"),
    ).toBeEnabled();
    expect(
      screen.queryByTestId("content-diagnostics-filter-indicator"),
    ).not.toBeInTheDocument();

    const sparseParams = new URL(
      String(
        fetchMock.callHistory.lastCall(
          "path:/api/ee/content-diagnostics/imbalanced",
        )?.url,
      ),
    ).searchParams;
    expect(sparseParams.getAll("finding-types")).toEqual(["sparse"]);
    expect(sparseParams.get("query")).toBeNull();
    expect(sparseParams.getAll("entity-types")).toEqual([]);
    expect(getTab("Sparse")).toHaveAttribute("aria-current", "page");
  });
});
