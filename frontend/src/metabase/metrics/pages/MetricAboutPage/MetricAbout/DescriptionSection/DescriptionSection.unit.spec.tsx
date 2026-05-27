import { Route } from "react-router";

import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { setupTableEndpoints } from "__support__/server-mocks/table";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import type { MetricUrls } from "../../../../types";

import { DescriptionSection } from "./DescriptionSection";

const DATABASE_ID = 42;
const TABLE_ID = 99;
const CARD_ID = 7;

const URLS: MetricUrls = {
  about: (id) => `/metric/${id}/about`,
  overview: (id) => `/metric/${id}/overview`,
  query: (id) => `/metric/${id}/query`,
  dependencies: (id) => `/metric/${id}/dependencies`,
  caching: (id) => `/metric/${id}/caching`,
  history: (id) => `/metric/${id}/history`,
  database: (id) => `/browse/databases/${id}`,
  table: (dbId, tableId) => `/question?db=${dbId}&table=${tableId}`,
};

type SetupOpts = {
  card?: Partial<Card>;
  role?: "admin" | "analyst" | "consumer";
  dependenciesCount?: number;
  dependentsCount?: number;
  dependenciesEnabled?: boolean;
};

function setup({
  card: cardOverrides,
  role = "consumer",
  dependenciesCount = 0,
  dependentsCount = 0,
  // Default on so admin/analyst role-gate tests see the Relationships section
  // (which itself requires the dependencies plugin to be enabled).
  dependenciesEnabled = true,
}: SetupOpts = {}) {
  jest
    .spyOn(PLUGIN_DEPENDENCIES, "useGetDependenciesCount")
    .mockReturnValue({ dependenciesCount, dependentsCount });
  jest.replaceProperty(PLUGIN_DEPENDENCIES, "isEnabled", dependenciesEnabled);
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

  const user = createMockUser({
    is_superuser: role === "admin",
    is_data_analyst: role === "analyst",
  });

  const state = createMockState({ currentUser: user });

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
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    it("is hidden when the dependencies plugin is disabled, even for admins", async () => {
      setup({ role: "admin", dependenciesEnabled: false });
      await screen.findByText("About");
      expect(screen.queryByText("Relationships")).not.toBeInTheDocument();
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
      const link = (await screen.findByText("1 chart")).closest("a");
      expect(link).toHaveTextContent("1 chart uses this metric");
    });

    it("uses plural verb agreement for multiple dependent charts", async () => {
      setup({ role: "admin", dependentsCount: 3 });
      const link = (await screen.findByText("3 charts")).closest("a");
      expect(link).toHaveTextContent("3 charts use this metric");
    });
  });
});
