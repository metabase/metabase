import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetricSourceId } from "metabase/metrics-viewer/types";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils/dimension-picker";

import { AddDimensionPopover } from "./AddDimensionPopover";

const SOURCE_ID: MetricSourceId = "metric:1";

const availableDimensions: AvailableDimensionsResult = {
  shared: [],
  bySource: {
    [SOURCE_ID]: [
      {
        icon: "label",
        tabInfo: {
          type: "category",
          label: "Category",
          dimensionMapping: { 0: "dim-category" },
        },
      },
    ],
  },
};

const sourceDataById: Record<MetricSourceId, SourceDisplayInfo> = {
  [SOURCE_ID]: { type: "metric", name: "Revenue" },
};

function setup({
  renderTrigger,
}: {
  renderTrigger?: ComponentProps<typeof AddDimensionPopover>["renderTrigger"];
} = {}) {
  const onAddTab = jest.fn();

  renderWithProviders(
    <AddDimensionPopover
      availableDimensions={availableDimensions}
      sourceOrder={[SOURCE_ID]}
      sourceDataById={sourceDataById}
      hasMultipleSources={false}
      canAddScalarTab={false}
      onAddTab={onAddTab}
      renderTrigger={renderTrigger}
    />,
  );

  return { onAddTab };
}

describe("AddDimensionPopover", () => {
  it("opens the picker from the default trigger", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Add dimension tab"));

    expect(
      await screen.findByRole("option", { name: "Category" }),
    ).toBeInTheDocument();
  });

  it("supports a custom trigger", async () => {
    const { onAddTab } = setup({
      renderTrigger: ({ toggle, isOpen }) => (
        <button aria-expanded={isOpen} onClick={toggle}>
          Add column
        </button>
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await userEvent.click(await screen.findByText("Category"));

    expect(onAddTab).toHaveBeenCalledWith({
      type: "category",
      label: "Category",
      dimensionMapping: { 0: "dim-category" },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("option", { name: "Category" }),
      ).not.toBeInTheDocument();
    });
  });
});
