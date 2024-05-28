import { render, screen } from "@testing-library/react";

import { getStatusColorRanges } from "metabase/lib/colors/groups";

import ColorRangeToggle, { getColorRangeLabel } from "./ColorRangeToggle";

const [range] = getStatusColorRanges();

function setup({ value = range, ...props }: any = {}) {
  const onToggleClick = jest.fn();
  const onColorRangeSelect = jest.fn();

  render(
    <ColorRangeToggle
      value={value}
      onToggleClick={onToggleClick}
      onColorRangeSelect={onColorRangeSelect}
      {...props}
    />,
  );

  return { onToggleClick, onColorRangeSelect };
}

describe("ColorRangeToggle", () => {
  describe("toggle button", () => {
    it("should not render when `showToggleButton` is undefined", () => {
      setup();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("should not render when `showToggleButton` is explicitly false", () => {
      setup({ showToggleButton: false });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("should render when turned on explicitly", () => {
      setup({ showToggleButton: true });
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("click handlers", () => {
    it("should handle click on the toggle button", () => {
      const { onToggleClick, onColorRangeSelect } = setup({
        showToggleButton: true,
      });

      screen.getByRole("button").click();
      expect(onToggleClick).toHaveBeenCalledTimes(1);
      expect(onColorRangeSelect).not.toHaveBeenCalled();
    });

    it("should handle click on the color range element", () => {
      const { onColorRangeSelect } = setup();
      const label = getColorRangeLabel(range);

      screen.getByLabelText(label).click();
      expect(onColorRangeSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("color range label helper", () => {
    it("should return empty string", () => {
      expect(getColorRangeLabel([])).toBe("");
      expect(getColorRangeLabel([""])).toBe("");
    });

    it("should return the exact value when array contains only one element", () => {
      expect(getColorRangeLabel(["foo"])).toBe("foo");
      expect(getColorRangeLabel(["1"])).toBe("1");
    });

    it("should join multiple array elements", () => {
      expect(getColorRangeLabel(["blue", "white"])).toBe("blue-white");
      expect(getColorRangeLabel(["green", "white", "red"])).toBe(
        "green-white-red",
      );
    });
  });
});
