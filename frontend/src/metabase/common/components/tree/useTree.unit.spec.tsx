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
});
