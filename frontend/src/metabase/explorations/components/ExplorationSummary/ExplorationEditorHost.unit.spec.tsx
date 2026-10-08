import { renderHook } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";

import { explorationEditorHost } from "./ExplorationEditorHost";

describe("explorationEditorHost.useCardEmbedSlots", () => {
  it("renders explore filter pills from host_data.explore_filters", () => {
    const { result } = renderHook(() =>
      explorationEditorHost.useCardEmbedSlots({
        childTargetId: "12",
        hostData: {
          query_ids: [101],
          explore_filters: [{ display_value: "TX", dimension_name: "State" }],
        },
      }),
    );

    expect(result.current.belowTitle).toBeTruthy();
    renderWithProviders(<>{result.current.belowTitle}</>);
    expect(screen.getByTestId("filter-pill")).toHaveTextContent("State: TX");
  });

  it("returns no belowTitle when host_data has no explore_filters", () => {
    const { result } = renderHook(() =>
      explorationEditorHost.useCardEmbedSlots({
        childTargetId: "12",
        hostData: { query_ids: [101] },
      }),
    );

    expect(result.current.belowTitle).toBeUndefined();
  });
});
