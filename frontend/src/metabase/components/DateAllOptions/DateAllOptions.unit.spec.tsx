import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders, screen } from "__support__/ui";
import type { DateAllOptionsProps } from "metabase/components/DateAllOptions/DateAllOptions";
import { DateAllOptions } from "metabase/components/DateAllOptions/DateAllOptions";
import type { DateShortcutOptions } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";

const TEST_DAY_MONTH_OPTIONS: Record<string, string> = {
  Today: "thisday",
  Yesterday: "past1days",
  "Last Week": "past1weeks",
  "Last 7 Days": "past7days",
  "Last 30 Days": "past30days",
  "Last Month": "past1months",
  "Last 3 Months": "past3months",
  "Last 12 Months": "past12months",
};

const TEST_MISC_OPTIONS = ["Specific dates…", "Relative dates…", "Exclude…"];

const TEST_DAY_MONTH_SHORTCUTS = Object.keys(TEST_DAY_MONTH_OPTIONS);

const filterShortcut = (filterValue: string): DateShortcutOptions => {
  return {
    DAY_OPTIONS: DATE_SHORTCUT_OPTIONS.DAY_OPTIONS.filter(
      ({ displayName }) => displayName !== filterValue,
    ),
    MONTH_OPTIONS: DATE_SHORTCUT_OPTIONS.MONTH_OPTIONS.filter(
      ({ displayName }) => displayName !== filterValue,
    ),
    MISC_OPTIONS: DATE_SHORTCUT_OPTIONS.MISC_OPTIONS.filter(
      ({ displayName }) => displayName !== filterValue,
    ),
  };
};

const TestDateAllOptions = ({
  dateShortcutOptions,
  onClose,
  setValue,
}: DateAllOptionsProps) => {
  const [testValue, setTestValue] = useState<string | null>(null);

  const onSetValue = (val: string | null) => {
    setTestValue(val);
    setValue(val);
  };

  return (
    <DateAllOptions
      value={testValue ?? undefined}
      setValue={onSetValue}
      onClose={onClose}
      disableOperatorSelection={false}
      dateShortcutOptions={dateShortcutOptions}
    />
  );
};

const setup = ({
  value = undefined,
  dateShortcutOptions = undefined,
}: {
  value?: string;
  dateShortcutOptions?: DateShortcutOptions;
} = {}) => {
  const setValueMock = jest.fn();
  const onCloseMock = jest.fn();

  renderWithProviders(
    <TestDateAllOptions
      setValue={setValueMock}
      onClose={onCloseMock}
      value={value}
      dateShortcutOptions={dateShortcutOptions}
    />,
  );

  return {
    setValueMock,
    onCloseMock,
  };
};

describe("DateAllOptions", () => {
  it("should render shortcut options", () => {
    setup();
    for (const option of TEST_DAY_MONTH_SHORTCUTS) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  describe("when a value is selected", () => {
    it.each(TEST_DAY_MONTH_SHORTCUTS)(
      "should call setValue with the correct value when %s is clicked",
      option => {
        const { onCloseMock, setValueMock } = setup();
        userEvent.click(screen.getByText(option));
        expect(setValueMock).toHaveBeenCalledWith(
          TEST_DAY_MONTH_OPTIONS[option],
        );
        expect(onCloseMock).toHaveBeenCalled();
      },
    );

    it("should call setValue in the correct string format when 'Specific dates…' is clicked", () => {
      const { onCloseMock, setValueMock } = setup();
      userEvent.click(screen.getByText("Specific dates…"));
      userEvent.click(screen.getByText("1"));
      userEvent.click(screen.getByText("15"));
      userEvent.click(screen.getByText("Update filter"));

      expect(setValueMock).toHaveBeenCalledWith("2023-09-01~2023-09-15");
      expect(onCloseMock).toHaveBeenCalled();
    });

    it("should call setValue in the correct string format when 'Relative dates…' is clicked", () => {
      const { onCloseMock, setValueMock } = setup();
      userEvent.click(screen.getByText("Relative dates…"));
      userEvent.clear(screen.getByTestId("relative-datetime-value"));
      userEvent.type(screen.getByTestId("relative-datetime-value"), "90");
      userEvent.click(screen.getByTestId("relative-datetime-unit"));
      userEvent.click(screen.getByText("quarters"));

      userEvent.click(screen.getByText("Update filter"));

      expect(setValueMock).toHaveBeenCalledWith("past90quarters");
      expect(onCloseMock).toHaveBeenCalled();
    });

    it("should call setValue in the correct string format when 'Exclude…' is clicked", () => {
      const { onCloseMock, setValueMock } = setup();
      userEvent.click(screen.getByText("Exclude…"));
      userEvent.click(screen.getByText("Days of the week..."));
      userEvent.click(screen.getByText("Monday"));
      userEvent.click(screen.getByText("Tuesday"));
      userEvent.click(screen.getByText("Wednesday"));

      userEvent.click(screen.getByText("Update filter"));

      expect(setValueMock).toHaveBeenCalledWith("exclude-days-Mon-Tue-Wed");
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  describe("when shortcuts should be excluded", () => {
    it.each([...TEST_MISC_OPTIONS, ...TEST_DAY_MONTH_SHORTCUTS])(
      "should not show %s when %s is filtered",
      shortcut => {
        setup({
          dateShortcutOptions: filterShortcut(shortcut),
        });

        expect(screen.queryByText(shortcut)).not.toBeInTheDocument();
      },
    );
  });
});
