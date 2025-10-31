import _userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/filters/constants";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";

import type { DatePickerSubmitButtonProps } from "../../types";

import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";

function getDefaultValue(
  direction: RelativeIntervalDirection,
): RelativeDatePickerValue {
  return {
    type: "relative",
    value: direction === "past" ? -30 : 30,
    unit: "day",
    offsetValue: -14,
    offsetUnit: "day",
  };
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

interface SetupOpts {
  value: RelativeDatePickerValue;
  availableUnits?: DatePickerUnit[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
}

function setup({
  value,
  availableUnits = DATE_PICKER_UNITS,
  renderSubmitButton,
}: SetupOpts) {
  const onChange = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <DateOffsetIntervalPicker
      value={value}
      availableUnits={availableUnits}
      renderSubmitButton={renderSubmitButton}
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

  describe.each<RelativeIntervalDirection>(["past", "future"])(
    "%s",
    (direction) => {
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
          value: direction === "past" ? -20 : 20,
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
          value: direction === "past" ? -10 : 10,
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
          value: direction === "past" ? -1 : 1,
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

        await userEvent.click(screen.getByRole("textbox", { name: "Unit" }));
        await userEvent.click(screen.getByText("years"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          unit: "year",
          offsetUnit: "year",
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to set only available units", async () => {
        setup({
          value: defaultValue,
          availableUnits: ["day", "year"],
        });

        await userEvent.click(screen.getByRole("textbox", { name: "Unit" }));
        expect(screen.getByText("days")).toBeInTheDocument();
        expect(screen.getByText("years")).toBeInTheDocument();
        expect(screen.queryByText("months")).not.toBeInTheDocument();

        const suffix = direction === "past" ? "ago" : "from now";
        await userEvent.click(
          screen.getByRole("textbox", { name: "Starting from unit" }),
        );
        expect(screen.getByText(`days ${suffix}`)).toBeInTheDocument();
        expect(screen.getByText(`years ${suffix}`)).toBeInTheDocument();
        expect(screen.queryByText(`months ${suffix}`)).not.toBeInTheDocument();
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
          offsetValue: direction === "past" ? -20 : 20,
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
          offsetValue: direction === "past" ? -10 : 10,
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

        const unitText = direction === "past" ? "years ago" : "years from now";
        await userEvent.click(
          screen.getByRole("textbox", { name: "Starting from unit" }),
        );

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

        await userEvent.click(
          screen.getByRole("textbox", { name: "Starting from unit" }),
        );

        expect(screen.getByText(/months (ago|from now)/)).toBeInTheDocument();
        expect(screen.getByText(/quarters (ago|from now)/)).toBeInTheDocument();
        expect(screen.getByText(/years (ago|from now)/)).toBeInTheDocument();
        expect(
          screen.queryByText(/hours (ago|from now)/),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/days (ago|from now)/),
        ).not.toBeInTheDocument();
      });

      it("should display the actual date range", () => {
        setup({
          value: defaultValue,
        });
        const rangeText =
          direction === "past"
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

      it("should pass the value to the submit button callback", async () => {
        const renderSubmitButton = jest.fn().mockReturnValue(null);
        setup({ value: defaultValue, renderSubmitButton });
        expect(renderSubmitButton).toHaveBeenCalledWith({
          value: defaultValue,
        });
      });
    },
  );
});
