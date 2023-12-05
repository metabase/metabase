import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { RelativeIntervalDirection } from "../../../types";
import type { DateIntervalValue } from "../../types";
import { SimpleDateIntervalPicker } from "./SimpleDateIntervalPicker";

function getDefaultValue(
  direction: RelativeIntervalDirection,
): DateIntervalValue {
  return {
    type: "relative",
    value: direction === "last" ? -30 : 30,
    unit: "day",
  };
}

interface SetupOpts {
  value: DateIntervalValue;
  isNew?: boolean;
  canUseRelativeOffsets?: boolean;
}

function setup({ value }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <SimpleDateIntervalPicker value={value} onChange={onChange} />,
  );

  return { onChange };
}

describe("SimpleDateIntervalPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe.each<RelativeIntervalDirection>(["last", "next"])(
    "%s",
    direction => {
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
        });
      });
    },
  );
});
