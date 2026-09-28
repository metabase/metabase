import type { NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

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
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDatabaseQuery,
  useGetDocumentQuery,
  useGetTableQuery,
} from "metabase/api";
import {
  DEFAULT_EDITOR_HOST,
  EditorHostProvider,
  type EntityDataResult,
  type SmartLinkEntity,
} from "metabase/rich_text_editing/tiptap/EditorHost";
import { RouterProviderMemory } from "metabase/router";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDatabase,
  createMockDocument,
  createMockTable,
} from "metabase-types/api/mocks";

import type { SuggestionModel } from "../shared/types";

import { SmartLinkComponent } from "./SmartLinkNode";

// Stands in for the resolver a composition root supplies, covering the models
// these tests link to.
const useTestEntityData = (
  entityId: number | null,
  model: SuggestionModel | null,
): EntityDataResult => {
  const isCard = model != null && ["card", "dataset", "metric"].includes(model);

  const cardQuery = useGetCardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || !isCard },
  );
  const dashboardQuery = useGetDashboardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || model !== "dashboard" },
  );
  const collectionQuery = useGetCollectionQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || model !== "collection" },
  );
  const tableQuery = useGetTableQuery(
    { id: entityId! },
    { skip: !entityId || model !== "table" },
  );
  const databaseQuery = useGetDatabaseQuery(
    { id: entityId! },
    { skip: !entityId || model !== "database" },
  );
  const documentQuery = useGetDocumentQuery(
    { id: entityId! },
    { skip: !entityId || model !== "document" },
  );

  switch (model) {
    case "card":
    case "dataset":
    case "metric":
      return {
        entity: cardQuery.data,
        isLoading: cardQuery.isLoading,
        error: cardQuery.error,
      };
    case "dashboard":
      return {
        entity: dashboardQuery.data,
        isLoading: dashboardQuery.isLoading,
        error: dashboardQuery.error,
      };
    case "collection":
      return {
        entity: collectionQuery.data,
        isLoading: collectionQuery.isLoading,
        error: collectionQuery.error,
      };
    case "table":
      return {
        entity: tableQuery.data,
        isLoading: tableQuery.isLoading,
        error: tableQuery.error,
      };
    case "database":
      return {
        entity: databaseQuery.data,
        isLoading: databaseQuery.isLoading,
        error: databaseQuery.error,
      };
    case "document":
      return {
        entity: documentQuery.data,
        isLoading: documentQuery.isLoading,
        error: documentQuery.error,
      };
    default:
      return { entity: null, isLoading: false, error: null };
  }
};

const testEditorHost = {
  ...DEFAULT_EDITOR_HOST,
  useEntityData: useTestEntityData,
};

const withResolver = (children: ReactNode) => (
  <EditorHostProvider value={testEditorHost}>{children}</EditorHostProvider>
);

function createProps(
  model: SuggestionModel,
  entity: SmartLinkEntity | { id: number; label?: string },
  label?: string,
  updateAttributes?: NodeViewProps["updateAttributes"],
) {
  const node = { attrs: { entityId: entity.id, model, label } };
  // Unjustified type cast. FIXME
  return {
    node,
    updateAttributes: updateAttributes ?? jest.fn(),
  } as unknown as NodeViewProps;
}

function setup({
  entity,
  model,
  label,
  updateAttributes,
}: {
  model: SuggestionModel;
  entity: SmartLinkEntity;
  label?: string;
  updateAttributes?: NodeViewProps["updateAttributes"];
}) {
  const props = createProps(model, entity, label, updateAttributes);
  renderWithProviders(withResolver(<SmartLinkComponent {...props} />), {
    withRouter: true,
  });
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

    it("updates missing labels for pasted smart links", async () => {
      const card = createMockCard({ id: 123, name: "Network Card Name" });
      const updateAttributes = jest.fn();

      setupCardEndpoints(card);
      setup({
        model: "card",
        entity: card,
        label: undefined,
        updateAttributes,
      });

      await waitFor(() => {
        expect(updateAttributes).toHaveBeenCalledWith({
          label: "Network Card Name",
        });
      });
    });

    it("should render the stored label as a link when no resolver is provided", () => {
      const card = createMockCard({ id: 42, name: "Network Card Name" });
      const props = createProps("card", card, "Stored Card Name");

      renderWithProviders(<SmartLinkComponent {...props} />, {
        withRouter: true,
      });

      expect(screen.getByText("Stored Card Name")).toBeInTheDocument();
      expect(screen.getByText("Stored Card Name").closest("a")).toHaveAttribute(
        "href",
        "/question/42-stored-card-name",
      );
      expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
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

      const props = createProps("dashboard", dashboard);
      renderWithProviders(
        <RouterProviderMemory
          initialRoute="/subpath"
          basename="/subpath"
          routes={[
            {
              path: "*",
              element: withResolver(<SmartLinkComponent {...props} />),
            },
          ]}
        />,
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

      const props = createProps("dashboard", dashboard);
      renderWithProviders(
        <RouterProviderMemory
          initialRoute="/"
          routes={[
            {
              path: "*",
              element: withResolver(<SmartLinkComponent {...props} />),
            },
          ]}
        />,
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
