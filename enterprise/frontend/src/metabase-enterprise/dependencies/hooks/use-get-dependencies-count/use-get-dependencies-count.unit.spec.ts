import { setupGetDependencyGraphEndpoint } from "__support__/server-mocks/dependencies";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DependencyGraph } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockDependencyEdge,
  createMockDependencyGraph,
  createMockTableDependencyNode,
} from "metabase-types/api/mocks";

import { useGetDependenciesCount } from "./use-get-dependencies-count";

type SetupOpts = {
  graph?: DependencyGraph;
};

function setup({ graph = createMockDependencyGraph() }: SetupOpts = {}) {
  setupGetDependencyGraphEndpoint(graph);

  return renderHookWithProviders(
    () => useGetDependenciesCount({ id: 1, type: "card" }),
    { storeInitialState: {} },
  );
}

describe("useGetDependenciesCount", () => {
  it("returns 0 counts and loading state when no graph data is available", async () => {
    const { result } = setup({ graph: createMockDependencyGraph() });

    // Initial state before data loads - isLoading will be true initially
    expect(result.current.dependenciesCount).toBe(0);
    expect(result.current.dependentsCount).toBe(0);
    // isLoading and isError are returned from the hook
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("isError");
  });

  it("counts upstream dependencies (edges where entity is from_entity)", async () => {
    // Card 1 depends on Table 10 and Table 20 (2 upstream dependencies)
    const graph = createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({ id: 1, dependents_count: {} }),
        createMockTableDependencyNode({ id: 10 }),
        createMockTableDependencyNode({ id: 20 }),
      ],
      edges: [
        // Card 1 -> Table 10 (card depends on table)
        createMockDependencyEdge({
          from_entity_id: 1,
          from_entity_type: "card",
          to_entity_id: 10,
          to_entity_type: "table",
        }),
        // Card 1 -> Table 20 (card depends on table)
        createMockDependencyEdge({
          from_entity_id: 1,
          from_entity_type: "card",
          to_entity_id: 20,
          to_entity_type: "table",
        }),
      ],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      expect(result.current.dependenciesCount).toBe(2);
    });
  });

  it("counts downstream dependents from node dependents_count", async () => {
    // Card 1 has 3 card dependents and 2 transform dependents (5 total downstream)
    const graph = createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({
          id: 1,
          dependents_count: { card: 3, transform: 2 },
        }),
      ],
      edges: [],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      expect(result.current.dependentsCount).toBe(5);
    });
  });

  it("returns both counts correctly in a complex graph", async () => {
    // Card 1:
    // - Depends on 2 tables (upstream)
    // - Has 4 downstream dependents (3 cards + 1 transform)
    const graph = createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({
          id: 1,
          dependents_count: { card: 3, transform: 1 },
        }),
        createMockTableDependencyNode({ id: 10 }),
        createMockTableDependencyNode({ id: 20 }),
      ],
      edges: [
        createMockDependencyEdge({
          from_entity_id: 1,
          from_entity_type: "card",
          to_entity_id: 10,
          to_entity_type: "table",
        }),
        createMockDependencyEdge({
          from_entity_id: 1,
          from_entity_type: "card",
          to_entity_id: 20,
          to_entity_type: "table",
        }),
        // Edge from another card to this card (should NOT count as a dependency for card 1)
        createMockDependencyEdge({
          from_entity_id: 99,
          from_entity_type: "card",
          to_entity_id: 1,
          to_entity_type: "card",
        }),
      ],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      expect(result.current.dependenciesCount).toBe(2);
    });
    expect(result.current.dependentsCount).toBe(4);
  });

  it("returns 0 dependents when node has no dependents_count", async () => {
    const graph = createMockDependencyGraph({
      nodes: [createMockCardDependencyNode({ id: 1, dependents_count: {} })],
      edges: [],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      expect(result.current.dependentsCount).toBe(0);
    });
  });

  it("returns 0 dependencies when there are no outgoing edges", async () => {
    const graph = createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({
          id: 1,
          dependents_count: { card: 2 },
        }),
      ],
      edges: [
        // Only incoming edge (another card depends on card 1)
        createMockDependencyEdge({
          from_entity_id: 99,
          from_entity_type: "card",
          to_entity_id: 1,
          to_entity_type: "card",
        }),
      ],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      expect(result.current.dependentsCount).toBe(2);
    });
    expect(result.current.dependenciesCount).toBe(0);
  });

  it("matches node by both id and type", async () => {
    // Graph has card 1 and table 1 - should only match card 1
    const graph = createMockDependencyGraph({
      nodes: [
        createMockCardDependencyNode({
          id: 1,
          dependents_count: { card: 5 },
        }),
        createMockTableDependencyNode({
          id: 1,
          dependents_count: { card: 10 },
        }),
      ],
      edges: [],
    });

    const { result } = setup({ graph });

    await waitFor(() => {
      // Should get card 1's count (5), not table 1's count (10)
      expect(result.current.dependentsCount).toBe(5);
    });
  });
});
