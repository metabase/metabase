import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { ChartSettingGoalValue } from "./ChartSettingGoalValue";

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
  rows: [[10]],
});

const DYNAMIC_TRIGGER = { name: "Pick a dynamic value" };

type SetupOpts = {
  showSelfColumns?: boolean;
  value?: GoalValue | null;
};

function setup({ showSelfColumns, value = 5 }: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingGoalValue
      data={DATA}
      datasetQuery={createMockStructuredDatasetQuery()}
      id="goal"
      showSelfColumns={showSelfColumns}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange, input: screen.getByRole("textbox") };
}

describe("ChartSettingGoalValue", () => {
  it("unsets the goal when the input is cleared", () => {
    const { input, onChange } = setup();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("offers dynamic values", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", DYNAMIC_TRIGGER));

    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    ).toBeInTheDocument();
  });

  it("can hide values from this question", async () => {
    setup({ showSelfColumns: false });

    await userEvent.click(screen.getByRole("button", DYNAMIC_TRIGGER));

    expect(
      screen.queryByRole("menuitem", { name: /Value from this question/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    ).toBeInTheDocument();
  });
});
