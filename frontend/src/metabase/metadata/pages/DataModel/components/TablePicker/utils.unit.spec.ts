import type { CardId, SearchResult, TableId } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";

import type {
  CollectionNode,
  DatabaseNode,
  ModelNode,
  SchemaNode,
} from "./types";
import { buildTreeFromSearchResults } from "./utils";

describe("buildTreeFromSearchResults", () => {
  it("returns an empty root node when given undefined or empty array", () => {
    expect(buildTreeFromSearchResults(undefined)).toMatchObject({
      type: "root",
      children: [],
    });
    expect(buildTreeFromSearchResults([])).toMatchObject({
      type: "root",
      children: [],
    });
  });

  it("builds hierarchical tree from tables across multiple databases and schemas", () => {
    const results = [
      createMockSearchResult({
        id: 1,
        model: "table",
        name: "users",
        database_id: 10,
        database_name: "Sample Database",
        table_schema: "public",
        initial_sync_status: "complete",
      }),
      createMockSearchResult({
        id: 2,
        model: "table",
        name: "orders",
        database_id: 10,
        database_name: "Sample Database",
        table_schema: "public",
        initial_sync_status: "complete",
      }),
      createMockSearchResult({
        id: 3,
        model: "table",
        name: "logs",
        database_id: 10,
        database_name: "Sample Database",
        table_schema: "private",
        initial_sync_status: "incomplete",
      }),
      createMockSearchResult({
        id: 4,
        model: "table",
        name: "products",
        database_id: 20,
        database_name: "E-commerce DB",
        table_schema: null,
        initial_sync_status: "complete",
      }),
    ] as SearchResult<TableId, "table">[];

    const tree = buildTreeFromSearchResults(results);

    expect(tree.children).toHaveLength(2);

    const db1 = tree.children[0] as DatabaseNode;
    expect(db1).toMatchObject({
      type: "database",
      label: "Sample Database",
      value: { databaseId: 10 },
      key: expect.any(String),
    });
    expect(db1.children).toHaveLength(2);
    expect(db1.children).toMatchObject([
      { type: "schema", label: "public" },
      { type: "schema", label: "private" },
    ]);

    const publicSchema = db1.children[0] as SchemaNode;
    expect(publicSchema.children).toHaveLength(2);
    expect(publicSchema.children).toMatchObject([
      {
        type: "table",
        label: "users",
        value: { tableId: 1 },
        disabled: false,
        icon: { name: "table2", color: "var(--mb-color-border-interactive)" },
        children: [],
      },
      { type: "table", label: "orders", disabled: false },
    ]);

    const privateSchema = db1.children[1] as SchemaNode;
    expect(privateSchema.children).toMatchObject([
      { type: "table", label: "logs", disabled: true },
    ]);

    const db2 = tree.children[1] as DatabaseNode;
    expect(db2).toMatchObject({
      label: "E-commerce DB",
      value: { databaseId: 20 },
    });
    const emptySchema = db2.children[0] as SchemaNode;
    expect(emptySchema).toMatchObject({
      label: "",
      value: { schemaName: "" },
    });
    expect(emptySchema.children).toMatchObject([{ label: "products" }]);
  });

  it("builds hierarchical tree from models across multiple collections", () => {
    const results = [
      createMockSearchResult({
        id: 100,
        model: "dataset",
        name: "Root Model 1",
        collection: { id: null, name: "Our analytics" } as any,
      }),
      createMockSearchResult({
        id: 101,
        model: "dataset",
        name: "Root Model 2",
        collection: { id: undefined, name: "Our analytics" } as any,
      }),
      createMockSearchResult({
        id: 102,
        model: "dataset",
        name: "Marketing Model 1",
        collection: { id: 5, name: "Marketing" } as any,
      }),
      createMockSearchResult({
        id: 103,
        model: "dataset",
        name: "Marketing Model 2",
        collection: { id: 5, name: "Marketing" } as any,
      }),
      createMockSearchResult({
        id: 104,
        model: "dataset",
        name: "Finance Model",
        collection: { id: 6, name: "Finance" } as any,
      }),
    ] as SearchResult<CardId, "dataset">[];

    const tree = buildTreeFromSearchResults(results);

    expect(tree.children).toHaveLength(4);

    const rootModels = tree.children.filter(
      (n) => n.type === "model",
    ) as ModelNode[];
    expect(rootModels).toHaveLength(2);
    expect(rootModels).toMatchObject([
      {
        type: "model",
        label: "Root Model 1",
        value: { collectionId: "root", modelId: 100 },
        icon: { name: "model", color: "var(--mb-color-border-interactive)" },
        children: [],
        key: expect.any(String),
      },
      {
        label: "Root Model 2",
        value: { collectionId: "root" },
      },
    ]);

    const collections = tree.children.filter(
      (n) => n.type === "collection",
    ) as CollectionNode[];
    expect(collections).toHaveLength(2);
    expect(collections).toMatchObject([
      { type: "collection", label: "Marketing" },
      { type: "collection", label: "Finance" },
    ]);

    const marketingCollection = collections[0];
    expect(marketingCollection.children).toHaveLength(2);
    expect(marketingCollection.children).toMatchObject([
      { label: "Marketing Model 1", value: { modelId: 102, collectionId: 5 } },
      { label: "Marketing Model 2" },
    ]);

    expect(collections[1].children).toHaveLength(1);
  });

  it("builds tree combining tables, models, and collections as siblings under root", () => {
    const results = [
      createMockSearchResult({
        id: 1,
        model: "table",
        name: "users",
        database_id: 10,
        database_name: "Sample DB",
        table_schema: "public",
        initial_sync_status: "complete",
      }),
      createMockSearchResult({
        id: 100,
        model: "dataset",
        name: "Root Model",
        collection: { id: null, name: "Our analytics" } as any,
      }),
      createMockSearchResult({
        id: 101,
        model: "dataset",
        name: "Marketing Model",
        collection: { id: 5, name: "Marketing" } as any,
      }),
    ] as (SearchResult<TableId, "table"> | SearchResult<CardId, "dataset">)[];

    const tree = buildTreeFromSearchResults(results);

    expect(tree.children).toHaveLength(3);

    const dbNode = tree.children[0] as DatabaseNode;
    expect(dbNode.type).toBe("database");
    expect(dbNode.children[0].children).toMatchObject([
      { type: "table", label: "users" },
    ]);

    const modelNode = tree.children[1] as ModelNode;
    expect(modelNode).toMatchObject({
      type: "model",
      label: "Root Model",
      value: { collectionId: "root", modelId: 100 },
    });

    const collectionNode = tree.children[2] as CollectionNode;
    expect(collectionNode.type).toBe("collection");
    expect(collectionNode.children).toMatchObject([
      { type: "model", label: "Marketing Model" },
    ]);
  });
});
