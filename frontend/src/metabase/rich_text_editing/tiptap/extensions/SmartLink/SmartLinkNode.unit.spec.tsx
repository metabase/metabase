import type { NodeViewProps } from "@tiptap/react";
import { createMemoryHistory } from "history";
import { Route, Router, useRouterHistory } from "react-router";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDatabaseEndpoints,
  setupDocumentEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDatabase,
  createMockDocument,
  createMockTable,
} from "metabase-types/api/mocks";

import type { SuggestionModel } from "../shared/types";

import { SmartLinkComponent, type SmartLinkEntity } from "./SmartLinkNode";

function createProps(
  model: SuggestionModel,
  entity: SmartLinkEntity | { id: number; label?: string },
  label?: string,
) {
  const node = { attrs: { entityId: entity.id, model, label } };
  return { node } as unknown as NodeViewProps;
}

function setup({
  entity,
  model,
  label,
}: {
  model: SuggestionModel;
  entity: SmartLinkEntity;
  label?: string;
}) {
  const props = createProps(model, entity, label);
  renderWithProviders(<SmartLinkComponent {...props} />);
}

describe("SmartLink", () => {
  describe("general", () => {
    it("renders cached label immediately while loading network data", async () => {
      const card = createMockCard({ name: "Network Card Name" });
      setupCardEndpoints(card);
      setup({ model: "card", entity: card, label: "Cached Card Name" });

      expect(screen.getByText("Cached Card Name")).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: /hourglass/ }),
      ).not.toBeInTheDocument();
      // Eventually updates to network data
      expect(await screen.findByText("Network Card Name")).toBeInTheDocument();
      expect(screen.queryByText("Cached Card Name")).not.toBeInTheDocument();
    });
  });

  describe("for Card", () => {
    it("should render the name of a card", async () => {
      const card = createMockCard({
        name: "My Card",
      });

      setupCardEndpoints(card);
      setup({ model: "card", entity: card });

      await waitFor(() => {
        expect(screen.getByText("My Card")).toBeInTheDocument();
      });
    });
  });

  describe("for Dashboard", () => {
    it("should render the name of a dashboard", async () => {
      const dashboard = createMockDashboard({
        name: "My Dashboard",
      });

      setupDashboardEndpoints(dashboard);
      setup({ model: "dashboard", entity: dashboard });

      await waitFor(() => {
        expect(screen.getByText("My Dashboard")).toBeInTheDocument();
      });
    });
  });

  describe("for Collection", () => {
    it("should render the name of a collection", async () => {
      const collection = createMockCollection({
        name: "My Collection",
      });

      setupCollectionByIdEndpoint({ collections: [collection] });
      setup({ model: "collection", entity: collection });

      await waitFor(() => {
        expect(screen.getByText("My Collection")).toBeInTheDocument();
      });
    });
  });

  describe("for Table", () => {
    it("should render the display name of a table when possible", async () => {
      const table = createMockTable({
        name: "TABLE_A",
        display_name: "Table A",
      });

      setupTableEndpoints(table);
      setup({ model: "table", entity: table });

      await waitFor(() => {
        expect(screen.getByText("Table A")).toBeInTheDocument();
      });
      expect(screen.queryByText("TABLE_A")).not.toBeInTheDocument();
    });

    it("should fall back to the name of a table when not possible", async () => {
      const table = createMockTable({
        name: "TABLE_A",
        display_name: "",
      });

      setupTableEndpoints(table);
      setup({ model: "table", entity: table });

      await waitFor(() => {
        expect(screen.getByText("TABLE_A")).toBeInTheDocument();
      });
    });
  });

  describe("for Database", () => {
    it("should render the name of a database", async () => {
      const database = createMockDatabase({
        name: "DATABASE_A",
      });

      setupDatabaseEndpoints(database);
      setup({ model: "database", entity: database });

      await waitFor(() => {
        expect(screen.getByText("DATABASE_A")).toBeInTheDocument();
      });
    });
  });

  describe("for Document", () => {
    it("should render the name of a document", async () => {
      const document = createMockDocument({
        name: "My Document",
      });

      setupDocumentEndpoints(document);
      setup({ model: "document", entity: document });

      await waitFor(() => {
        expect(screen.getByText("My Document")).toBeInTheDocument();
      });
    });
  });

  describe("link generation", () => {
    it("should include subpath in link href when router has basename", async () => {
      const dashboard = createMockDashboard({
        id: 456,
        name: "Subpath Dashboard",
      });

      setupDashboardEndpoints(dashboard);

      const historyWithBasename = useRouterHistory(createMemoryHistory)({
        basename: "/subpath",
        entries: ["/"],
      });

      const props = createProps("dashboard", dashboard);
      renderWithProviders(
        <Router history={historyWithBasename}>
          <Route path="*" component={() => <SmartLinkComponent {...props} />} />
        </Router>,
      );

      await waitFor(() => {
        expect(screen.getByText("Subpath Dashboard")).toBeInTheDocument();
      });

      const link = screen.getByText("Subpath Dashboard").closest("a");
      expect(link).toHaveAttribute(
        "href",
        "/subpath/dashboard/456-subpath-dashboard",
      );
    });

    it("should work correctly without subpath", async () => {
      const dashboard = createMockDashboard({
        id: 789,
        name: "No Subpath Dashboard",
      });

      setupDashboardEndpoints(dashboard);

      const historyNoBasename = useRouterHistory(createMemoryHistory)({
        entries: ["/"],
      });

      const props = createProps("dashboard", dashboard);
      renderWithProviders(
        <Router history={historyNoBasename}>
          <Route path="*" component={() => <SmartLinkComponent {...props} />} />
        </Router>,
      );

      await waitFor(() => {
        expect(screen.getByText("No Subpath Dashboard")).toBeInTheDocument();
      });

      const link = screen.getByText("No Subpath Dashboard").closest("a");
      expect(link).toHaveAttribute(
        "href",
        "/dashboard/789-no-subpath-dashboard",
      );
    });
  });
});
