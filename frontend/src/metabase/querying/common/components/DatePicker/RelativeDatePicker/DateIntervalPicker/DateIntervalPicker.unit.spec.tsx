import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/common/constants";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";

import type { DatePickerSubmitButtonProps } from "../../types";

import { DateIntervalPicker } from "./DateIntervalPicker";

function getDefaultValue(
  direction: RelativeIntervalDirection,
): RelativeDatePickerValue {
  return {
    type: "relative",
    value: direction === "past" ? -30 : 30,
    unit: "day",
  };
}

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
    <DateIntervalPicker
      value={value}
      availableUnits={availableUnits}
      renderSubmitButton={renderSubmitButton}
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
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to set only available units", async () => {
        setup({
          value: defaultValue,
          availableUnits: ["day", "month"],
        });
        await userEvent.click(screen.getByRole("textbox", { name: "Unit" }));
        expect(screen.getByText("days")).toBeInTheDocument();
        expect(screen.getByText("months")).toBeInTheDocument();
        expect(screen.queryByText("years")).not.toBeInTheDocument();
      });

      it("should allow to include the current unit", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        await userEvent.click(await screen.findByText("Include today"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          options: {
            includeCurrent: true,
          },
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should allow to a relative offset", async () => {
        const { onChange, onSubmit } = setup({
          value: defaultValue,
        });

        await userEvent.click(await screen.findByLabelText("Starting from…"));

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          offsetUnit: "day",
          offsetValue: direction === "past" ? -7 : 7,
          options: undefined,
        });
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("should display the actual date range", () => {
        setup({
          value: defaultValue,
        });

        const rangeText =
          direction === "past" ? "Dec 2–31, 2019" : "Jan 2–31, 2020";
        expect(screen.getByText(rangeText)).toBeInTheDocument();
      });

      it("should display the actual date range with include current", () => {
        setup({
          value: {
            ...defaultValue,
            options: { includeCurrent: true },
          },
        });

        const rangeText =
          direction === "past" ? "Dec 2, 2019 – Jan 1, 2020" : "Jan 1–31, 2020";
        expect(screen.getByText(rangeText)).toBeInTheDocument();
      });

      it("should pass the value to the submit button callback", async () => {
        const renderSubmitButton = jest.fn().mockReturnValue(null);
        setup({ value: defaultValue, renderSubmitButton });
        expect(renderSubmitButton).toHaveBeenCalledWith({
          value: defaultValue,
          isDisabled: false,
        });
      });
    },
  );
});
