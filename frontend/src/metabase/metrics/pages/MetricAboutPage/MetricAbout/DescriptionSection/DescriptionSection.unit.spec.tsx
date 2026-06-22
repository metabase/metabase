import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { setupDependencyGraphEndpoint } from "__support__/server-mocks/dependencies";
import { setupTableEndpoints } from "__support__/server-mocks/table";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetricUrls } from "metabase/common/metrics/types";
import { createMockState } from "metabase/redux/store/mocks";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockCardDependencyNode,
  createMockDependencyEdge,
  createMockDependencyGraph,
} from "metabase-types/api/mocks/dependencies";

import { DescriptionSection } from "./DescriptionSection";

const DATABASE_ID = 42;
const TABLE_ID = 99;
const CARD_ID = 7;

const URLS: MetricUrls = {
  about: (id) => `/metric/${id}/about`,
  overview: (id) => `/metric/${id}/overview`,
  query: (id) => `/metric/${id}/query`,
  dependencies: (id) => `/metric/${id}/dependencies`,
  history: (id) => `/metric/${id}/history`,
  database: (id) => `/browse/databases/${id}`,
  table: (dbId, tableId) => `/question?db=${dbId}&table=${tableId}`,
};

type SetupOpts = {
  card?: Partial<Card>;
  role?: "admin" | "analyst" | "consumer";
  dependenciesCount?: number;
  dependentsCount?: number;
};

function setup({
  card: cardOverrides,
  role = "consumer",
  dependenciesCount = 0,
  dependentsCount = 0,
}: SetupOpts = {}) {
  setupDependencyGraphEndpoint(
    createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({
          id: CARD_ID,
          dependents_count: { dashboard: dependentsCount },
        }),
      ],
      edges: Array.from({ length: dependenciesCount }, () =>
        createMockDependencyEdge({
          to_entity_id: CARD_ID,
          to_entity_type: "card",
        }),
      ),
    }),
  );

  const card = createMockCard({
    id: CARD_ID,
    type: "metric",
    can_write: true,
    description: "An important metric",
    database_id: DATABASE_ID,
    table_id: TABLE_ID,
    updated_at: "2026-05-20T10:00:00Z",
    ...cardOverrides,
  });

  setupDatabaseEndpoints(
    createMockDatabase({ id: DATABASE_ID, name: "Analytics warehouse" }),
  );
  setupTableEndpoints(
    createMockTable({
      id: TABLE_ID,
      db_id: DATABASE_ID,
      name: "ad_events",
      display_name: "Ad Events",
    }),
  );

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: role === "admin",
      is_data_analyst: role === "analyst",
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    }),
  });
  // Enable the dependencies plugin via real EE init (reads the mocked settings).
  setupEnterprisePlugins();

  renderWithProviders(
    <Route
      path="/"
      component={() => <DescriptionSection card={card} urls={URLS} />}
    />,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );

  return { card };
}

describe("DescriptionSection", () => {
  it("renders the About heading and last-updated subline", async () => {
    setup();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(await screen.findByTestId("metric-last-updated")).toHaveTextContent(
      /Last updated/,
    );
  });

  it("renders EditableText when the user can write", async () => {
    setup({ card: { can_write: true } });
    expect(await screen.findByTestId("editable-text")).toBeInTheDocument();
  });

  it("renders read-only Markdown when the user cannot write", () => {
    setup({ card: { can_write: false, description: "Read me" } });
    expect(screen.queryByTestId("editable-text")).not.toBeInTheDocument();
    expect(screen.getByText("Read me")).toBeInTheDocument();
  });

  it("falls back to 'No description' for an empty read-only description", () => {
    setup({ card: { can_write: false, description: null } });
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  describe("Source sub-section", () => {
    it("renders database and table rows linked to the right URLs", async () => {
      setup();

      const dbAnchor = (await screen.findByText("Analytics warehouse")).closest(
        "a",
      );
      expect(dbAnchor).toHaveAttribute(
        "href",
        `/browse/databases/${DATABASE_ID}`,
      );

      const tableAnchor = (await screen.findByText("Ad Events")).closest("a");
      expect(tableAnchor).toHaveAttribute(
        "href",
        `/question?db=${DATABASE_ID}&table=${TABLE_ID}`,
      );
    });

    it("hides the Source sub-section when no database or table is set", () => {
      setup({ card: { database_id: undefined, table_id: undefined } });
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    });
  });

  describe("Relationships sub-section", () => {
    it("is hidden for consumers", async () => {
      setup({ role: "consumer" });
      await screen.findByText("About");
      expect(screen.queryByText("Relationships")).not.toBeInTheDocument();
    });

    it("is visible for admins", async () => {
      setup({ role: "admin" });
      expect(await screen.findByText("Relationships")).toBeInTheDocument();
    });

    it("is visible for data analysts", async () => {
      setup({ role: "analyst" });
      expect(await screen.findByText("Relationships")).toBeInTheDocument();
    });

    it("shows empty-state copy when there are no dependencies or charts", async () => {
      setup({ role: "admin" });
      await waitFor(() => {
        expect(screen.getByText("No dependencies")).toBeInTheDocument();
      });
      expect(screen.getByText("No charts use this metric")).toBeInTheDocument();

      expect(
        screen.queryByRole("link", { name: /dependency|dependencies/i }),
      ).not.toBeInTheDocument();
    });

    it("uses singular verb agreement for one dependent chart", async () => {
      setup({ role: "admin", dependentsCount: 1 });
      expect(
        (await screen.findByText("1 chart")).closest("a"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("metric-description-sidebar"),
      ).toHaveTextContent("1 chart uses this metric");
    });

    it("uses plural verb agreement for multiple dependent charts", async () => {
      setup({ role: "admin", dependentsCount: 3 });
      expect(
        (await screen.findByText("3 charts")).closest("a"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("metric-description-sidebar"),
      ).toHaveTextContent("3 charts use this metric");
    });
  });
});
