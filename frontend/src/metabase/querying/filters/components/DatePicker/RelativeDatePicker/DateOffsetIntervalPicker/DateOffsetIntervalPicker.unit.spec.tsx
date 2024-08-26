import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type { RelativeIntervalDirection } from "../../types";
import type { DateOffsetIntervalValue } from "../types";

import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";

function getDefaultValue(
  direction: RelativeIntervalDirection,
): DateOffsetIntervalValue {
  return {
    type: "relative",
    value: direction === "last" ? -30 : 30,
    unit: "day",
    offsetValue: -14,
    offsetUnit: "day",
  };
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

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

  describe.each<RelativeIntervalDirection>(["last", "next"])(
    "%s",
    direction => {
      const defaultValue = getDefaultValue(direction);

      it("should change the interval", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.type(input, "20");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "last" ? -20 : 20,
        });
        expect(onSubmit).not.toHaveBeenCalled();

        await userEvent.type(input, "{enter}");
        expect(onSubmit).toHaveBeenCalled();
      });

      it("should change the interval with a negative value", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.type(input, "-10");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "last" ? -10 : 10,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should coerce zero", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.type(input, "0");
        await userEvent.tab();

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "last" ? -1 : 1,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore empty values", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore invalid values", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.type(input, "abc");
        await userEvent.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to change the unit", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        await userEvent.click(screen.getByLabelText("Unit"));
        await userEvent.click(screen.getByText("years"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          unit: "year",
          offsetUnit: "year",
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should change the offset interval", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Starting from interval");
        await userEvent.clear(input);
        await userEvent.type(input, "20");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          offsetValue: direction === "last" ? -20 : 20,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should change the offset interval with a negative value", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Starting from interval");
        await userEvent.clear(input);
        await userEvent.type(input, "-10");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          offsetValue: direction === "last" ? -10 : 10,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should accept zero offset interval", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Starting from interval");
        await userEvent.clear(input);
        await userEvent.type(input, "0");
        await userEvent.tab();

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          offsetValue: 0,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore an empty offset interval", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Starting from interval");
        await userEvent.clear(input);
        await userEvent.tab();

        expect(input).toHaveValue("14");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should ignore invalid offset values", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await userEvent.clear(input);
        await userEvent.type(input, "abc");
        await userEvent.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to change the offset unit", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        const unitText = direction === "last" ? "years ago" : "years from now";
        await userEvent.click(screen.getByLabelText("Starting from unit"));
        await userEvent.click(screen.getByText(unitText));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          offsetUnit: "year",
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should only show offset units larger or equal to the current one", async () => {
        setup({
          value: {
            ...defaultValue,
            unit: "month",
          },
        });

        await userEvent.click(screen.getByLabelText("Starting from unit"));

        expect(screen.getByText(/months/)).toBeInTheDocument();
        expect(screen.getByText(/quarters/)).toBeInTheDocument();
        expect(screen.getByText(/years/)).toBeInTheDocument();
        expect(screen.queryByText(/hours/)).not.toBeInTheDocument();
        expect(screen.queryByText(/days/)).not.toBeInTheDocument();
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

      it("should be able to remove the offset", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        await userEvent.click(screen.getByLabelText("Remove offset"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          offsetValue: undefined,
          offsetUnit: undefined,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });
    },
  );
});
