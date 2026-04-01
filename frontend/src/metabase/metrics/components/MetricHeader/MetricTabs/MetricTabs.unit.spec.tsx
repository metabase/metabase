import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupMetricEndpoint } from "__support__/server-mocks/metric";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitFor } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockField,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import type { MetricUrls } from "../../../types";

import { MetricTabs } from "./MetricTabs";

const urls: MetricUrls = {
  about: (id) => `/metric/${id}/about`,
  overview: (id) => `/metric/${id}/overview`,
  query: (id) => `/metric/${id}/query`,
  dependencies: (id) => `/metric/${id}/dependencies`,
  caching: (id) => `/metric/${id}/caching`,
  history: (id) => `/metric/${id}/history`,
};

describe("MetricTabs", () => {
  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        cache_granular_controls: true,
      }),
    });
    setupEnterprisePlugins();
  });

  function setup({
    card: cardOverrides,
    hasDimensions = true,
    hasDataPermissions = true,
  }: {
    card?: Partial<Card>;
    hasDimensions?: boolean;
    hasDataPermissions?: boolean;
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
      entities: createMockEntitiesState({
        databases: hasDataPermissions ? [createSampleDatabase()] : [],
        questions: [card],
      }),
    });

    renderWithProviders(<MetricTabs card={card} urls={urls} />, {
      storeInitialState: state,
    });
  }

  function getTabLabels() {
    return Array.from(
      document.querySelectorAll(".mb-mantine-Button-label"),
    ).map((element) => element.textContent);
  }

  it("should show the caching tab when the user has write access", async () => {
    setup({ card: { can_write: true } });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Overview",
        "Definition",
        "Caching",
        "History",
      ]);
    });
  });

  it("should not show the caching tab when the user has no write access", async () => {
    setup({ card: { can_write: false } });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Overview",
        "Definition",
        "History",
      ]);
    });
  });

  it("should hide the overview tab when metric has no dimensions", async () => {
    setup({ hasDimensions: false });
    await waitFor(() => {
      expect(getTabLabels()).toEqual([
        "About",
        "Definition",
        "Caching",
        "History",
      ]);
    });
  });

  it("should hide the overview and definition tabs when the query is not editable", async () => {
    setup({
      hasDataPermissions: false,
      hasDimensions: true,
      card: { can_write: false },
    });
    await waitFor(() => {
      expect(getTabLabels()).toEqual(["About", "History"]);
    });
  });
});
