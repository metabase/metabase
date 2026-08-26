import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { TaskRunDateFilterOption } from "metabase-types/api";

import { TaskRunDatePicker } from "./TaskRunDatePicker";

const PLACEHOLDER = "Filter by started at";

type SetupOpts = {
  value?: TaskRunDateFilterOption | null;
  includeToday?: boolean;
};

const setup = ({ value = null, includeToday = false }: SetupOpts = {}) => {
  const onChange = jest.fn();

  const Wrapper = () => {
    const [innerValue, setInnerValue] =
      useState<TaskRunDateFilterOption | null>(value);
    const [innerIncludeToday, setInnerIncludeToday] = useState(includeToday);

    return (
      <TaskRunDatePicker
        value={innerValue}
        includeToday={innerIncludeToday}
        placeholder={PLACEHOLDER}
        onChange={(nextValue, nextIncludeToday) => {
          onChange(nextValue, nextIncludeToday);
          setInnerValue(nextValue);
          setInnerIncludeToday(nextIncludeToday);
        }}
      />
    );
  };

  renderWithProviders(<Wrapper />);

  return { onChange };
};

const openPicker = async () => {
  await userEvent.click(screen.getByTestId("task-run-date-picker"));
};

const selectRange = async (label: string) => {
  await userEvent.click(screen.getByPlaceholderText("Started at"));
  await userEvent.click(await screen.findByRole("option", { name: label }));
};

describe("TaskRunDatePicker", () => {
  it("renders the placeholder when there is no value", () => {
    setup();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("emits the selected range with the current include-today flag", async () => {
    const { onChange } = setup();

    await openPicker();
    await selectRange("Previous week");

    expect(onChange).toHaveBeenCalledWith("past1weeks", false);
  });

  it("disables the include-today switch when no range is selected", async () => {
    setup();
    await openPicker();

    expect(
      screen.getByRole("switch", { name: "Include today" }),
    ).toBeDisabled();
  });

  it("disables the include-today switch and forces it off for Today", async () => {
    const { onChange } = setup({ includeToday: true });

    await openPicker();
    await selectRange("Today");

    expect(onChange).toHaveBeenCalledWith("thisday", false);
    expect(
      screen.getByRole("switch", { name: "Include today" }),
    ).toBeDisabled();
  });

  it("emits the include-today flag when the switch is toggled", async () => {
    const { onChange } = setup({ value: "past1weeks" });

    await openPicker();
    await userEvent.click(
      screen.getByRole("switch", { name: "Include today" }),
    );

    expect(onChange).toHaveBeenCalledWith("past1weeks", true);
  });

  it("shows the including-today suffix in the trigger label", async () => {
    setup({ value: "past1weeks", includeToday: true });

    expect(
      screen.getByText("Previous week, including today"),
    ).toBeInTheDocument();
  });

  it("does not show the suffix for a range that disallows today", () => {
    setup({ value: "thisday", includeToday: true });

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText(/including today/)).not.toBeInTheDocument();
  });

  it("clears the value through the clear button", async () => {
    const { onChange } = setup({ value: "past1weeks", includeToday: true });

    await userEvent.click(screen.getByLabelText("Clear"));

    expect(onChange).toHaveBeenCalledWith(null, false);
  });
});
