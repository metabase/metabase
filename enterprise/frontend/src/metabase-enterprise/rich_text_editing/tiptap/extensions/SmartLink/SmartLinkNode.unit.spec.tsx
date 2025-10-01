import type { NodeViewProps } from "@tiptap/react";

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

function createProps(model: SuggestionModel, entity: SmartLinkEntity) {
  const node = { attrs: { entityId: entity.id, model } };
  return { node } as unknown as NodeViewProps;
}

function setup({
  entity,
  model,
}: {
  model: SuggestionModel;
  entity: SmartLinkEntity;
}) {
  const props = createProps(model, entity);
  renderWithProviders(<SmartLinkComponent {...props} />);
}

describe("SmartLink", () => {
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
});
