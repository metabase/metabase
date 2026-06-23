import { act, renderHook } from "@testing-library/react";

import { useTree } from "./useTree";

const nestedData = [
  {
    id: "A",
    name: "A",
    icon: "group" as const,
    children: [{ id: "A1", name: "A1", icon: "group" as const }],
  },
  {
    id: "B",
    name: "B",
    icon: "group" as const,
    children: [{ id: "B1", name: "B1", icon: "group" as const }],
  },
];

// Structurally different from `nestedData` (deep-unequal so `dataHasChanged`
// fires) while keeping the A → A1 path, mimicking a poll that reorders/updates.
const nestedDataUpdated = [
  {
    id: "A",
    name: "A",
    icon: "group" as const,
    children: [{ id: "A1", name: "A1", icon: "group" as const }],
  },
  {
    id: "B",
    name: "B",
    icon: "group" as const,
    children: [{ id: "B1", name: "B1 (updated)", icon: "group" as const }],
  },
];

describe("useTree", () => {
  it("collapse removes an id from expandedIds", () => {
    const { result } = renderHook(() =>
      useTree({ data: nestedData, selectedId: "A1" }),
    );

    expect(result.current.expandedIds.has("A")).toBe(true);

    act(() => {
      result.current.collapse("A");
    });

    expect(result.current.expandedIds.has("A")).toBe(false);
  });

  it("re-expands a collapsed ancestor of the selected item on data change by default", () => {
    const { result, rerender } = renderHook((props) => useTree(props), {
      initialProps: { data: nestedData, selectedId: "A1" },
    });

    act(() => result.current.handleToggleExpand("A"));
    expect(result.current.expandedIds.has("A")).toBe(false);

    rerender({ data: nestedDataUpdated, selectedId: "A1" });
    expect(result.current.expandedIds.has("A")).toBe(true);
  });

  describe("freezeAutoExpandOnManualToggle", () => {
    it("keeps a manually collapsed node collapsed across data changes", () => {
      const { result, rerender } = renderHook((props) => useTree(props), {
        initialProps: {
          data: nestedData,
          selectedId: "A1",
          freezeAutoExpandOnManualToggle: true,
        },
      });

      act(() => result.current.handleToggleExpand("A"));
      expect(result.current.expandedIds.has("A")).toBe(false);

      rerender({
        data: nestedDataUpdated,
        selectedId: "A1",
        freezeAutoExpandOnManualToggle: true,
      });
      expect(result.current.expandedIds.has("A")).toBe(false);
    });

    it("does not auto-expand a newly-selected node's group after a manual toggle", () => {
      const { result, rerender } = renderHook((props) => useTree(props), {
        initialProps: {
          data: nestedData,
          selectedId: "A1",
          freezeAutoExpandOnManualToggle: true,
        },
      });

      // User toggles a group → expansion is now frozen.
      act(() => result.current.handleToggleExpand("A"));

      // A poll moves the auto-selection to a different group's leaf.
      rerender({
        data: nestedDataUpdated,
        selectedId: "B1",
        freezeAutoExpandOnManualToggle: true,
      });

      // The newly-selected group is NOT auto-expanded.
      expect(result.current.expandedIds.has("B")).toBe(false);
    });

    it("freezes after the user expands a node via the chevron too", () => {
      const { result, rerender } = renderHook((props) => useTree(props), {
        initialProps: {
          data: nestedData,
          selectedId: "A1",
          freezeAutoExpandOnManualToggle: true,
        },
      });

      // Collapse imperatively (non-freezing), then expand B via the chevron
      // (this is the manual toggle that freezes auto-expand).
      act(() => result.current.collapse("A"));
      act(() => result.current.handleToggleExpand("B"));

      rerender({
        data: nestedDataUpdated,
        selectedId: "A1",
        freezeAutoExpandOnManualToggle: true,
      });

      // A is not re-expanded — auto-expand is frozen by the earlier chevron toggle.
      expect(result.current.expandedIds.has("A")).toBe(false);
    });

    it("an imperative collapse does not freeze auto-expand", () => {
      const { result, rerender } = renderHook((props) => useTree(props), {
        initialProps: {
          data: nestedData,
          selectedId: "A1",
          freezeAutoExpandOnManualToggle: true,
        },
      });

      // `collapse()` is the keyboard handler's imperative tidy — not a manual toggle.
      act(() => result.current.collapse("A"));
      rerender({
        data: nestedDataUpdated,
        selectedId: "A1",
        freezeAutoExpandOnManualToggle: true,
      });

      expect(result.current.expandedIds.has("A")).toBe(true);
    });
  });
});
