import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { RelativeIntervalDirection } from "../../types";
import type { DateIntervalValue } from "../types";
import { DateIntervalPicker } from "./DateIntervalPicker";

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

function setup({
  value,
  isNew = false,
  canUseRelativeOffsets = false,
}: SetupOpts) {
  const onChange = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <DateIntervalPicker
      value={value}
      isNew={isNew}
      canUseRelativeOffsets={canUseRelativeOffsets}
      onChange={onChange}
      onSubmit={onSubmit}
    />,
  );

  return { onChange, onSubmit };
}

describe("DateIntervalPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe.each<RelativeIntervalDirection>(["last", "next"])(
    "%s",
    direction => {
      const defaultValue = getDefaultValue(direction);

      it("should change the interval", () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        userEvent.clear(input);
        userEvent.type(input, "20");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "last" ? -20 : 20,
        });
        expect(onSubmit).not.toHaveBeenCalled();

        userEvent.type(input, "{enter}");
        expect(onSubmit).toHaveBeenCalled();
      });

      it("should change the interval with a negative value", () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        userEvent.clear(input);
        userEvent.type(input, "-10");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "last" ? -10 : 10,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should coerce zero", () => {
        const { onChange, onSubmit } = setup({
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
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore empty values", () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        userEvent.clear(input);
        userEvent.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore invalid values", () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        userEvent.clear(input);
        userEvent.type(input, "abc");
        userEvent.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to change the unit", () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        userEvent.click(screen.getByLabelText("Unit"));
        userEvent.click(screen.getByText("years"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          unit: "year",
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to include the current unit", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        userEvent.click(screen.getByLabelText("Options"));
        userEvent.click(await screen.findByText("Include today"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          options: {
            "include-current": true,
          },
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should not allow to add relative offsets by default", async () => {
        setup({
          value: defaultValue,
        });

        userEvent.click(screen.getByLabelText("Options"));
        expect(await screen.findByText("Include today")).toBeInTheDocument();
        expect(screen.queryByText("Starting from…")).not.toBeInTheDocument();
      });

      it("should allow to a relative offset if enabled", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
          canUseRelativeOffsets: true,
        });

        userEvent.click(screen.getByLabelText("Options"));
        userEvent.click(await screen.findByText("Starting from…"));

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          offsetUnit: "day",
          offsetValue: direction === "last" ? -7 : 7,
          options: undefined,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should display the actual date range", () => {
        setup({
          value: defaultValue,
        });

        const rangeText =
          direction === "last" ? "Dec 2–31, 2019" : "Jan 2–31, 2020";
        expect(screen.getByText(rangeText)).toBeInTheDocument();
      });

      it("should display the actual date range with include current", () => {
        setup({
          value: {
            ...defaultValue,
            options: { "include-current": true },
          },
        });

        const rangeText =
          direction === "last" ? "Dec 2, 2019 – Jan 1, 2020" : "Jan 1–31, 2020";
        expect(screen.getByText(rangeText)).toBeInTheDocument();
      });
    },
  );
});
