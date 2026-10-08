import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";

import { LegendItem } from "./LegendItem";

const setup = (props: Partial<ComponentProps<typeof LegendItem>> = {}) => {
  const onSelectSeries = jest.fn();
  const onToggleSeriesVisibility = jest.fn();

  render(
    <LegendItem
      item={{ key: "organic", name: "Organic", color: "#509EE3" }}
      index={2}
      onSelectSeries={onSelectSeries}
      onToggleSeriesVisibility={onToggleSeriesVisibility}
      {...props}
    />,
  );

  return { onSelectSeries, onToggleSeriesVisibility };
};

describe("LegendItem", () => {
  it("toggles the series once when its marker or label is clicked", async () => {
    const { onSelectSeries, onToggleSeriesVisibility } = setup();

    await userEvent.click(screen.getByTestId("legend-item-dot"));

    expect(onToggleSeriesVisibility).toHaveBeenCalledTimes(1);
    expect(onToggleSeriesVisibility).toHaveBeenCalledWith(expect.anything(), 2);

    await userEvent.click(screen.getByText("Organic"));

    expect(onToggleSeriesVisibility).toHaveBeenCalledTimes(2);
    expect(onToggleSeriesVisibility).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      2,
    );
    expect(onSelectSeries).not.toHaveBeenCalled();
  });

  it.each(["{Enter}", " "])("toggles the series using %s", async (key) => {
    const { onSelectSeries, onToggleSeriesVisibility } = setup();

    await userEvent.tab();
    await userEvent.keyboard(key);

    expect(onToggleSeriesVisibility).toHaveBeenCalledTimes(1);
    expect(onSelectSeries).not.toHaveBeenCalled();
  });

  it("offers to show a hidden series", () => {
    setup({
      item: {
        key: "organic",
        name: "Organic",
        color: "#509EE3",
        visible: false,
      },
    });

    expect(screen.getByRole("button", { name: "Show series" })).toBeVisible();
  });

  it("renders an informational item when no action is available", () => {
    setup({ onToggleSeriesVisibility: undefined, onSelectSeries: undefined });

    expect(screen.getByText("Organic")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
