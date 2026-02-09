import { setupCollectionTreeEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { createMockRemoteSyncEntity } from "metabase-types/api/mocks/remote-sync";

import { AllChangesView } from "./AllChangesView";

const defaultCollection = createMockCollection({
  id: 1,
  name: "Entity Collection",
});

const updatedEntity = createMockRemoteSyncEntity({
  collection_id: 1,
});
const removedEntity = createMockRemoteSyncEntity({
  id: 2,
  name: "Removed Question",
  sync_status: "removed",
  collection_id: 1,
});
const deletedEntity = createMockRemoteSyncEntity({
  id: 3,
  name: "Deleted Question",
  sync_status: "delete",
  collection_id: 1,
});

const setup = ({
  entities = [updatedEntity],
  collections = [defaultCollection],
}: {
  entities: RemoteSyncEntity[];
  collections?: Collection[];
}) => {
  setupCollectionTreeEndpoint(collections);

  renderWithProviders(<AllChangesView entities={entities} />);
};

describe("AllChangesView", () => {
  describe("warning message", () => {
    it("should show a warning when removing entities", () => {
      setup({ entities: [updatedEntity, removedEntity] });

      expect(screen.getByText(/that depend on the items/)).toBeInTheDocument();
    });

    it("should show a warning when deleting entities", () => {
      setup({ entities: [updatedEntity, deletedEntity] });

      expect(screen.getByText(/that depend on the items/)).toBeInTheDocument();
    });

    it("should not show a warning when no items have been removed or deleted", () => {
      setup({ entities: [updatedEntity] });

      expect(
        screen.queryByText(/that depend on the items/),
      ).not.toBeInTheDocument();
    });
  });

  describe("namespaced collections", () => {
    it("should display collections from namespaces like shared-tenant-collection", async () => {
      const namespacedCollection = createMockCollection({
        id: 10,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        effective_ancestors: [],
      });
      const entityInNamespacedCollection = createMockRemoteSyncEntity({
        id: 20,
        name: "Dashboard in Tenant Collection",
        model: "dashboard",
        collection_id: 10,
        sync_status: "update",
      });

      setup({
        entities: [entityInNamespacedCollection],
        collections: [namespacedCollection],
      });

      expect(await screen.findByText("Tenant Collection")).toBeInTheDocument();
      expect(
        screen.getByText("Dashboard in Tenant Collection"),
      ).toBeInTheDocument();
    });

    it("should display collection hierarchy for namespaced collections with ancestors", async () => {
      const childCollection = createMockCollection({
        id: 10,
        name: "Child Tenant Collection",
        namespace: "shared-tenant-collection",
      });
      const parentCollection = createMockCollection({
        id: 5,
        name: "Parent Tenant Collection",
        namespace: "shared-tenant-collection",
        children: [childCollection],
      });
      const entityInChildCollection = createMockRemoteSyncEntity({
        id: 20,
        name: "Item in Child Collection",
        model: "card",
        collection_id: 10,
        sync_status: "create",
      });

      setup({
        entities: [entityInChildCollection],
        collections: [parentCollection],
      });

      expect(
        await screen.findByText("Parent Tenant Collection"),
      ).toBeInTheDocument();
      expect(screen.getByText("Child Tenant Collection")).toBeInTheDocument();
      expect(screen.getByText("Item in Child Collection")).toBeInTheDocument();
    });

    it("should display regular items in collections", async () => {
      const entityInCollection = createMockRemoteSyncEntity({
        id: 20,
        name: "Regular Item",
        model: "card",
        collection_id: 1,
        sync_status: "update",
      });

      setup({
        entities: [entityInCollection],
      });

      expect(await screen.findByText("Entity Collection")).toBeInTheDocument();
      expect(screen.getByText("Regular Item")).toBeInTheDocument();
    });
  });

  describe("transforms namespace collections", () => {
    it("should display transforms collections when remote-sync-transforms is enabled", async () => {
      const transformsCollection = createMockCollection({
        id: 100,
        name: "My Transforms Collection",
        namespace: "transforms",
        effective_ancestors: [],
      });
      const transformEntity = createMockRemoteSyncEntity({
        id: 200,
        name: "Transform in Collection",
        model: "transform",
        collection_id: 100,
        sync_status: "create",
      });

      setup({
        entities: [transformEntity],
        collections: [transformsCollection],
      });

      expect(
        await screen.findByText("My Transforms Collection"),
      ).toBeInTheDocument();
      expect(screen.getByText("Transform in Collection")).toBeInTheDocument();
    });

    it("should display transforms collection hierarchy when remote-sync-transforms is enabled", async () => {
      const childTransformsCollection = createMockCollection({
        id: 101,
        name: "Child Transforms Collection",
        namespace: "transforms",
      });
      const parentTransformsCollection = createMockCollection({
        id: 100,
        name: "Parent Transforms Collection",
        namespace: "transforms",
        children: [childTransformsCollection],
      });
      const transformEntity = createMockRemoteSyncEntity({
        id: 200,
        name: "Transform in Child",
        model: "transform",
        collection_id: 101,
        sync_status: "update",
      });

      setup({
        entities: [transformEntity],
        collections: [parentTransformsCollection],
      });

      expect(
        await screen.findByText("Parent Transforms Collection"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Child Transforms Collection"),
      ).toBeInTheDocument();
      expect(screen.getByText("Transform in Child")).toBeInTheDocument();
    });

    it("should display dirty transforms collections themselves", async () => {
      const transformsCollection = createMockCollection({
        id: 100,
        name: "New Transforms Collection",
        namespace: "transforms",
        effective_ancestors: [],
      });
      const collectionEntity = createMockRemoteSyncEntity({
        id: 100,
        name: "New Transforms Collection",
        model: "collection",
        collection_id: 100,
        sync_status: "create",
      });

      setup({
        entities: [collectionEntity],
        collections: [transformsCollection],
      });

      expect(
        await screen.findByText("New Transforms Collection"),
      ).toBeInTheDocument();
    });
  });

  describe("table child models", () => {
    it("should display measures nested under their parent table", async () => {
      const tableEntity = createMockRemoteSyncEntity({
        id: 100,
        name: "Orders Table",
        model: "table",
        collection_id: 1,
        sync_status: "update",
      });
      const measureEntity = createMockRemoteSyncEntity({
        id: 200,
        name: "Total Revenue",
        model: "measure",
        collection_id: 1,
        sync_status: "create",
        table_id: 100,
        table_name: "Orders Table",
      });

      setup({
        entities: [tableEntity, measureEntity],
      });

      expect(await screen.findByText("Entity Collection")).toBeInTheDocument();
      expect(screen.getByText("Orders Table")).toBeInTheDocument();
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    });

    it("should display measures with table name when table is not dirty", async () => {
      const measureEntity = createMockRemoteSyncEntity({
        id: 200,
        name: "Total Revenue",
        model: "measure",
        collection_id: 1,
        sync_status: "update",
        table_id: 100,
        table_name: "Orders Table",
      });

      setup({
        entities: [measureEntity],
      });

      expect(await screen.findByText("Entity Collection")).toBeInTheDocument();
      expect(screen.getByText("Orders Table")).toBeInTheDocument();
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    });

    it("should display segments nested under their parent table", async () => {
      const segmentEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "Active Users",
        model: "segment",
        collection_id: 1,
        sync_status: "create",
        table_id: 100,
        table_name: "Users Table",
      });

      setup({
        entities: [segmentEntity],
      });

      expect(await screen.findByText("Entity Collection")).toBeInTheDocument();
      expect(screen.getByText("Users Table")).toBeInTheDocument();
      expect(screen.getByText("Active Users")).toBeInTheDocument();
    });

    it("should group multiple table children under the same table", async () => {
      const fieldEntity = createMockRemoteSyncEntity({
        id: 400,
        name: "email",
        model: "field",
        collection_id: 1,
        sync_status: "update",
        table_id: 100,
        table_name: "Users Table",
      });
      const measureEntity = createMockRemoteSyncEntity({
        id: 500,
        name: "Total Users",
        model: "measure",
        collection_id: 1,
        sync_status: "create",
        table_id: 100,
        table_name: "Users Table",
      });

      setup({
        entities: [fieldEntity, measureEntity],
      });

      expect(await screen.findByText("Entity Collection")).toBeInTheDocument();
      expect(screen.getByText("Users Table")).toBeInTheDocument();
      expect(screen.getByText("email")).toBeInTheDocument();
      expect(screen.getByText("Total Users")).toBeInTheDocument();
    });
  });

  describe("snippet collections", () => {
    it("should display snippets in snippet collections with hierarchy", async () => {
      const snippetCollection = createMockCollection({
        id: 50,
        name: "My Snippets",
        namespace: "snippets",
        effective_ancestors: [],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "SELECT Query",
        model: "nativequerysnippet",
        collection_id: 50,
        sync_status: "create",
      });

      setup({
        entities: [snippetEntity],
        collections: [snippetCollection],
      });

      expect(await screen.findByText("My Snippets")).toBeInTheDocument();
      expect(screen.getByText("SELECT Query")).toBeInTheDocument();
    });

    it("should display nested snippet collection hierarchy", async () => {
      const childSnippetCollection = createMockCollection({
        id: 51,
        name: "Child Snippet Folder",
        namespace: "snippets",
      });
      const parentSnippetCollection = createMockCollection({
        id: 50,
        name: "Parent Snippet Folder",
        namespace: "snippets",
        children: [childSnippetCollection],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "SELECT Query",
        model: "nativequerysnippet",
        collection_id: 51,
        sync_status: "update",
      });

      setup({
        entities: [snippetEntity],
        collections: [parentSnippetCollection],
      });

      expect(
        await screen.findByText("Parent Snippet Folder"),
      ).toBeInTheDocument();
      expect(screen.getByText("Child Snippet Folder")).toBeInTheDocument();
      expect(screen.getByText("SELECT Query")).toBeInTheDocument();
    });
  });

  describe("snippets and snippet collections with Library (data_studio)", () => {
    it("should display snippets without collection_id under the Library collection", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "Root Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "create",
      });

      setup({
        entities: [snippetEntity],
        collections: [libraryCollection],
      });

      expect(await screen.findByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Root Snippet")).toBeInTheDocument();
      expect(screen.queryByText("Root")).not.toBeInTheDocument();
    });

    it("should display snippets without collection_id under Root when no Library collection exists", async () => {
      const regularCollection = createMockCollection({
        id: 1,
        name: "Regular Collection",
        effective_ancestors: [],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "Root Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "create",
      });

      setup({
        entities: [snippetEntity],
        collections: [regularCollection],
      });

      expect(await screen.findByText("Root")).toBeInTheDocument();
      expect(screen.getByText("Root Snippet")).toBeInTheDocument();
    });

    it("should display multiple snippets without collection_id under the Library collection", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const snippetEntity1 = createMockRemoteSyncEntity({
        id: 300,
        name: "First Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "create",
      });
      const snippetEntity2 = createMockRemoteSyncEntity({
        id: 301,
        name: "Second Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "update",
      });

      setup({
        entities: [snippetEntity1, snippetEntity2],
        collections: [libraryCollection],
      });

      expect(await screen.findByText("Library")).toBeInTheDocument();
      expect(screen.getByText("First Snippet")).toBeInTheDocument();
      expect(screen.getByText("Second Snippet")).toBeInTheDocument();
    });

    it("should display snippets with explicit collection_id in their assigned collection under Library", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const snippetCollection = createMockCollection({
        id: 50,
        name: "My Snippets",
        namespace: "snippets",
        effective_ancestors: [],
      });
      const snippetWithCollection = createMockRemoteSyncEntity({
        id: 300,
        name: "Assigned Snippet",
        model: "nativequerysnippet",
        collection_id: 50,
        sync_status: "create",
      });
      const snippetWithoutCollection = createMockRemoteSyncEntity({
        id: 301,
        name: "Unassigned Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "create",
      });

      setup({
        entities: [snippetWithCollection, snippetWithoutCollection],
        collections: [libraryCollection, snippetCollection],
      });

      expect(await screen.findByText("My Snippets")).toBeInTheDocument();
      expect(screen.getByText("Assigned Snippet")).toBeInTheDocument();

      const libraryElements = screen.getAllByText("Library");
      expect(libraryElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Unassigned Snippet")).toBeInTheDocument();
    });

    it("should display non-snippet entities without collection_id under Root even when Library exists", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const cardEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "Root Card",
        model: "card",
        collection_id: undefined,
        sync_status: "create",
      });

      setup({
        entities: [cardEntity],
        collections: [libraryCollection],
      });

      expect(await screen.findByText("Root")).toBeInTheDocument();
      expect(screen.getByText("Root Card")).toBeInTheDocument();
      expect(screen.queryByText("Library")).not.toBeInTheDocument();
    });

    it("should find Library collection in nested tree structure", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const parentCollection = createMockCollection({
        id: 1,
        name: "Parent Collection",
        children: [libraryCollection],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "Nested Library Snippet",
        model: "nativequerysnippet",
        collection_id: undefined,
        sync_status: "create",
      });

      setup({
        entities: [snippetEntity],
        collections: [parentCollection],
      });

      expect(await screen.findByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Nested Library Snippet")).toBeInTheDocument();
    });

    it("should display snippet collections as descendants of Library", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const snippetCollection = createMockCollection({
        id: 50,
        name: "My Snippets",
        namespace: "snippets",
        effective_ancestors: [],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "SELECT Query",
        model: "nativequerysnippet",
        collection_id: 50,
        sync_status: "create",
      });

      setup({
        entities: [snippetEntity],
        collections: [libraryCollection, snippetCollection],
      });

      expect(await screen.findByText("Library")).toBeInTheDocument();
      expect(screen.getByText("My Snippets")).toBeInTheDocument();
      expect(screen.getByText("SELECT Query")).toBeInTheDocument();
    });

    it("should display nested snippet collections under Library with full hierarchy", async () => {
      const libraryCollection = createMockCollection({
        id: 99,
        name: "Library",
        type: "library",
        effective_ancestors: [],
      });
      const childSnippetCollection = createMockCollection({
        id: 51,
        name: "Child Snippet Folder",
        namespace: "snippets",
      });
      const parentSnippetCollection = createMockCollection({
        id: 50,
        name: "Parent Snippet Folder",
        namespace: "snippets",
        children: [childSnippetCollection],
      });
      const snippetEntity = createMockRemoteSyncEntity({
        id: 300,
        name: "SELECT Query",
        model: "nativequerysnippet",
        collection_id: 51,
        sync_status: "update",
      });

      setup({
        entities: [snippetEntity],
        collections: [libraryCollection, parentSnippetCollection],
      });

      expect(await screen.findByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Parent Snippet Folder")).toBeInTheDocument();
      expect(screen.getByText("Child Snippet Folder")).toBeInTheDocument();
      expect(screen.getByText("SELECT Query")).toBeInTheDocument();
    });
  });
});
