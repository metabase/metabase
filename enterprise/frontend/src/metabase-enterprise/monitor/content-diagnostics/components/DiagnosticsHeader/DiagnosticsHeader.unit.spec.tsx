import fetchMock from "fetch-mock";

import {
  setupContentDiagnosticsCountsEndpoint,
  setupContentDiagnosticsCountsErrorEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ContentDiagnosticsCountsResponse } from "metabase-types/api";

import { ContentDiagnosticsSectionLayout } from "../../routes";

import { DiagnosticsHeader } from "./DiagnosticsHeader";

interface SetupOpts {
  counts?: ContentDiagnosticsCountsResponse;
  error?: boolean;
  delay?: number;
}

function setup({
  counts = {
    stale: 137,
    duplicated: 0,
    slow: 23,
    empty: 1,
    sparse: 6,
    crowded: 2,
  },
  error = false,
  delay,
}: SetupOpts = {}) {
  if (error) {
    setupContentDiagnosticsCountsErrorEndpoint();
  } else {
    setupContentDiagnosticsCountsEndpoint(counts, { delay });
  }
  return renderWithProviders(
    <Route element={<ContentDiagnosticsSectionLayout />}>
      <Route path="*" element={<DiagnosticsHeader />} />
    </Route>,
    {
      withRouter: true,
      initialRoute: `${Urls.staleContent()}?query=filtered&page=2&threshold-days=90`,
    },
  );
}

const getTab = (name: string) => screen.getByRole("link", { name });
const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/counts");

const TAB_COUNTS = [
  ["Stale", "137"],
  ["Duplicated", "0"],
  ["Slow", "23"],
  ["Empty", "1"],
  ["Sparse", "6"],
  ["Crowded", "2"],
] as const;

describe("DiagnosticsHeader", () => {
  it("shows each tab's exact default count, including zero, without fetching any table", async () => {
    setup();

    for (const [name, count] of TAB_COUNTS) {
      expect(await within(getTab(name)).findByText(count)).toBeInTheDocument();
    }
    expect(getCountCalls()).toHaveLength(1);
    expect(new URL(getCountCalls()[0].url).search).toBe("");
    for (const endpoint of ["stale", "duplicated", "slow", "imbalanced"]) {
      expect(
        fetchMock.callHistory.calls(
          `path:/api/ee/content-diagnostics/${endpoint}`,
        ),
      ).toHaveLength(0);
    }
  });

  it("keeps all six tabs usable while counts load", async () => {
    setup({ delay: 100 });

    for (const [name] of TAB_COUNTS) {
      expect(
        within(getTab(name)).getByTestId("tab-count-skeleton"),
      ).toBeInTheDocument();
    }
    expect(getTab("Crowded")).toHaveAttribute(
      "href",
      Urls.imbalancedContent("crowded"),
    );
    expect(await within(getTab("Stale")).findByText("137")).toBeInTheDocument();
  });

  it("hides failed counts without removing navigation", async () => {
    setup({ error: true });

    await waitFor(() => {
      expect(getCountCalls()).toHaveLength(1);
      expect(
        fetchMock.callHistory.done("path:/api/ee/content-diagnostics/counts"),
      ).toBe(true);
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
    });
    for (const [name] of TAB_COUNTS) {
      expect(within(getTab(name)).queryByText(/\d/)).not.toBeInTheDocument();
    }
  });
});
