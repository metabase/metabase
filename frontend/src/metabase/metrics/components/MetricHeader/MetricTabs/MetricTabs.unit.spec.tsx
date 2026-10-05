import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupMetricEndpoint } from "__support__/server-mocks/metric";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetricUrls } from "metabase/common/metrics/types";
import { Route } from "metabase/router";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockField,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { MetricTabs } from "./MetricTabs";

const urls: MetricUrls = {
  about: (id) => `/metric/${id}`,
  overview: (id) => `/metric/${id}/overview`,
  query: (id) => `/metric/${id}/query`,
  dimensions: (id) => `/metric/${id}/dimensions`,
  dependencies: (id) => `/metric/${id}/dependencies`,
  history: (id) => `/metric/${id}/history`,
};

describe("MetricTabs", () => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
      cache_granular_controls: true,
      dependencies: true,
    }),
  });

  beforeAll(() => {
    setupEnterprisePlugins();
  });

  function setup({
    card: cardOverrides,
    hasDimensions = true,
    hasDataPermissions = true,
    role = "consumer",
    initialRoute = "/",
  }: {
    card?: Partial<Card>;
    hasDimensions?: boolean;
    hasDataPermissions?: boolean;
    role?: "admin" | "analyst" | "consumer";
    initialRoute?: string;
  } = {}) {
    const card = createMockCard({
      type: "metric",
      can_write: true,
      last_query_start: "2024-01-01T00:00:00Z",
      result_metadata: [createMockField({ base_type: "type/Integer" })],
      ...cardOverrides,
    });

    const metric = createMockMetric({
      id: card.id,
      dimensions: hasDimensions ? [createMockMetricDimension()] : [],
    });

    setupMetricEndpoint(metric);

    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: role === "admin",
        is_data_analyst: role === "analyst",
      }),
      settings,
      entities: createMockEntitiesState({
        databases: hasDataPermissions ? [createSampleDatabase()] : [],
        questions: [card],
      }),
    });

    renderWithProviders(
      <Route path="*" element={<MetricTabs card={card} urls={urls} />} />,
      {
        withRouter: true,
        initialRoute,
        storeInitialState: state,
      },
    );
  }

  function getTabLabels() {
    return screen.queryAllByRole("link").map((link) => link.textContent);
  }

  it("does not show the caching tab in the tabs row regardless of write access", async () => {
    setup({ card: { can_write: true } });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Overview",
        "Definition",
        "Dimensions",
        "History",
      ]);
    });
  });

  it("does not show the caching tab when the user has no write access", async () => {
    setup({ card: { can_write: false } });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Overview",
        "Definition",
        "Dimensions",
        "History",
      ]);
    });
  });

  it("hides the overview tab when the metric has no dimensions", async () => {
    setup({ hasDimensions: false });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Definition",
        "Dimensions",
        "History",
      ]);
    });
  });

  it("should hide the overview, definition, and dimensions tabs when the query is not editable", async () => {
    setup({
      hasDataPermissions: false,
      hasDimensions: true,
      card: { can_write: false },
    });
    await waitFor(() => {
      expect(getTabLabels()).toEqual(["About", "History"]);
    });
  });

  it("shows the dimensions tab for editable metrics", async () => {
    setup();
    await waitFor(() => {
      expect(getTabLabels()).toContain("Dimensions");
    });
  });

  it("marks About as the current page for a slugged metric URL (#83344)", async () => {
    setup({ card: { id: 9 }, initialRoute: "/metric/9-revenue" });

    expect(await screen.findByRole("link", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it.each(["/metric/9-revenue/query", "/metric/90-revenue"])(
    "does not mark About as current at %s (#83344)",
    async (initialRoute) => {
      setup({ card: { id: 9 }, initialRoute });

      expect(
        await screen.findByRole("link", { name: "About" }),
      ).not.toHaveAttribute("aria-current");
    },
  );

  describe("Dependencies tab (role-gated)", () => {
    it("shows for admins", async () => {
      setup({ role: "admin" });
      await waitFor(() => {
        expect(getTabLabels()).toContain("Dependencies");
      });
    });

    it("shows for data analysts", async () => {
      setup({ role: "analyst" });
      await waitFor(() => {
        expect(getTabLabels()).toContain("Dependencies");
      });
    });

    it("is hidden for consumers", async () => {
      setup({ role: "consumer" });
      await screen.findByText("About");
      expect(getTabLabels()).not.toContain("Dependencies");
    });
  });
});
