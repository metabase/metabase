import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { IntervalDirection, DateOffsetIntervalValue } from "../types";
import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";

function getDefaultValue(
  direction: IntervalDirection,
): DateOffsetIntervalValue {
  return {
    type: "relative",
    value: direction === "last" ? -30 : 30,
    unit: "day",
    offsetValue: -14,
    offsetUnit: "day",
  };
}

interface SetupOpts {
  value: DateOffsetIntervalValue;
  isNew?: boolean;
}

function setup({ value, isNew = false }: SetupOpts) {
  const onChange = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <DateOffsetIntervalPicker
      value={value}
      isNew={isNew}
      onChange={onChange}
      onSubmit={onSubmit}
    />,
  );

  return { onChange, onSubmit };
}

describe("DateOffsetIntervalPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe.each<IntervalDirection>(["last", "next"])("%s", direction => {
    const defaultValue = getDefaultValue(direction);

    it("should change the interval", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "20");

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        value: direction === "last" ? -20 : 20,
      });
    });

    it("should change the interval with a negative value", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "-10");

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        value: direction === "last" ? -10 : 10,
      });
    });

    it("should coerce zero", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "0");
      userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        value: direction === "last" ? -1 : 1,
      });
    });

    it("should ignore empty values", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should ignore invalid values", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "abc");
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow to change the unit", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      userEvent.click(screen.getByLabelText("Unit"));
      userEvent.click(screen.getByText("years"));

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        unit: "year",
        offsetUnit: "year",
      });
    });

    it("should change the offset interval", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Starting from interval");
      userEvent.clear(input);
      userEvent.type(input, "20");

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        offsetValue: direction === "last" ? -20 : 20,
      });
    });

    it("should change the offset interval with a negative value", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Starting from interval");
      userEvent.clear(input);
      userEvent.type(input, "-10");

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        offsetValue: direction === "last" ? -10 : 10,
      });
    });

    it("should accept zero offset interval", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Starting from interval");
      userEvent.clear(input);
      userEvent.type(input, "0");
      userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultValue,
        offsetValue: 0,
      });
    });

    it("should ignore an empty offset interval", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Starting from interval");
      userEvent.clear(input);
      userEvent.tab();

      expect(input).toHaveValue("14");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should ignore invalid offset values", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "abc");
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow to change the offset unit", () => {
      const { onChange } = setup({
        value: defaultValue,
      });

      const unitText = direction === "last" ? "years ago" : "years from now";
      userEvent.click(screen.getByLabelText("Starting from unit"));
      userEvent.click(screen.getByText(unitText));

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        offsetUnit: "year",
      });
    });

    it("should display the actual date range", () => {
      setup({
        value: defaultValue,
      });
      const rangeText =
        direction === "last"
          ? "Nov 18 – Dec 17, 2019"
          : "Dec 19, 2019 – Jan 17, 2020";
      expect(screen.getByText(rangeText)).toBeInTheDocument();
    });
  });
});
