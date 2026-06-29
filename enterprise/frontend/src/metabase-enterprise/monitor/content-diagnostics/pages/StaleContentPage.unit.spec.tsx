import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
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
import * as Urls from "metabase/urls";
import type {
  ContentDiagnosticsFinding,
  ContentDiagnosticsUserParams,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsFinding,
  createMockListStaleFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaleContentPage } from "./StaleContentPage";

const FINDINGS: ContentDiagnosticsFinding[] = [
  createMockContentDiagnosticsFinding({
    id: 1,
    entity_type: "card",
    entity_display_name: "Sales overview",
  }),
  createMockContentDiagnosticsFinding({
    id: 2,
    entity_type: "dashboard",
    entity_display_name: "Marketing funnel",
  }),
];

type SetupOpts = {
  findings?: ContentDiagnosticsFinding[];
  total?: number;
  urlParams?: Urls.ContentDiagnosticsParams;
  lastUsedParams?: ContentDiagnosticsUserParams;
};

function setup({
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
}: SetupOpts = {}) {
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({
      data: findings,
      total: total ?? findings.length,
    }),
  );

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "stale",
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const { history } = renderWithProviders(
    <Route path={Urls.staleContent()} component={StaleContentPage} />,
    {
      withRouter: true,
      initialRoute: Urls.staleContent(urlParams),
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { history };
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("StaleContentPage", () => {
  it("renders stale findings in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(await within(list).findByText("Sales overview")).toBeInTheDocument();
    expect(within(list).getByText("Marketing funnel")).toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    setup({ findings: [] });

    expect(
      await screen.findByText("No stale content found"),
    ).toBeInTheDocument();
  });

  it("filters the visible rows by name via search", async () => {
    setup({ findings: FINDINGS });
    await waitForListToLoad();

    const input = screen.getByTestId("stale-content-search-input");
    await userEvent.type(input, "sales");

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
  });

  it("sets the page parameter when navigating to the next page", async () => {
    const { history } = setup({ findings: FINDINGS, total: 50 });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(history?.getCurrentLocation().query).toEqual({ page: "1" });
  });

  it("filters the visible rows by entity type via the Filter popover", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(history?.getCurrentLocation().query).toEqual({
      "entity-types": ["card", "document", "collection", "transform"],
    });
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { entity_types: ["card"] },
    });

    await waitForListToLoad();

    // Restored filter is reflected in the URL and applied to the table.
    // (A single value is serialized as a string by the router.)
    expect(history?.getCurrentLocation().query).toEqual({
      "entity-types": "card",
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
  });

  it("prefers URL params over the last-used filter", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["dashboard"] },
      lastUsedParams: { entity_types: ["card"] },
    });

    await waitForListToLoad();

    expect(history?.getCurrentLocation().query).toEqual({
      "entity-types": "dashboard",
    });
    expect(screen.getByText("Marketing funnel")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();
  });
});
