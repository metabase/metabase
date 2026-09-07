import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ChartSettingGoalInputProps } from "metabase/viz-core";
import { createMockColumn } from "metabase-types/api/mocks";

import { ChartSettingGoalInput } from "./ChartSettingGoalInput";

const COLUMNS = [
  createMockColumn({
    name: "value",
    display_name: "Value",
    base_type: "type/Integer",
  }),
  createMockColumn({
    name: "goal",
    display_name: "Goal",
    base_type: "type/Integer",
  }),
];

const setup = (props: Partial<ChartSettingGoalInputProps> = {}) => {
  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingGoalInput
      id="goal-input"
      value={0}
      onChange={onChange}
      {...props}
    />,
  );

  return { onChange };
};

describe("ChartSettingGoalInput", () => {
  it("renders a numeric input with no menu when there are no numeric columns", () => {
    setup({ value: 42 });

    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /chevrondown/ }),
    ).not.toBeInTheDocument();
  });

  it("lets you pick a column from the same question", async () => {
    const { onChange } = setup({ value: 0, columns: COLUMNS });

    await userEvent.click(screen.getByRole("img", { name: /chevrondown/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Goal" }));

    expect(onChange).toHaveBeenCalledWith("goal");
  });

  it("lets you switch back to a custom value", async () => {
    const { onChange } = setup({ value: "goal", columns: COLUMNS });

    await userEvent.click(screen.getByRole("img", { name: /chevrondown/ }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Custom value" }),
    );

    expect(onChange).toHaveBeenCalledWith(0);
  });
});
