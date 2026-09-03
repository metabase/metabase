import userEvent from "@testing-library/user-event";

import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
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

function setup({
  isDynamic,
  withData = true,
  showSelfColumns,
  value = 5,
}: {
  isDynamic?: boolean;
  withData?: boolean;
  showSelfColumns?: boolean;
  value?: GoalValue | null;
}) {
  const onChange = jest.fn();
  renderWithProviders(
    <ChartSettingGoalValue
      data={withData ? DATA : undefined}
      datasetQuery={createMockStructuredDatasetQuery()}
      id="goal"
      isDynamic={isDynamic}
      showSelfColumns={showSelfColumns}
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange, input: screen.getByRole("textbox") };
}

describe("ChartSettingGoalValue", () => {
  describe("without dynamic goals", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("behaves like the numeric input, without a dynamic value trigger", async () => {
      const { input, onChange } = setup({ isDynamic: false });
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      expect(input).toHaveDisplayValue("5");
      expect(
        screen.queryByRole("button", DYNAMIC_TRIGGER),
      ).not.toBeInTheDocument();

      await user.clear(input);
      await user.type(input, "12.5");
      act(() => jest.runAllTimers());
      expect(onChange).toHaveBeenLastCalledWith(12.5);

      await user.clear(input);
      act(() => jest.runAllTimers());
      expect(onChange).toHaveBeenLastCalledWith(undefined);
    });

    it("shows a reference as an empty input", () => {
      const { input } = setup({
        isDynamic: false,
        value: { type: "card", id: 1, column: "sum" },
      });

      expect(input).toHaveDisplayValue("");
    });
  });

  describe("with dynamic goals", () => {
    it("falls back to a static input when there is no data", () => {
      const { input, onChange } = setup({ isDynamic: true, withData: false });

      expect(
        screen.queryByRole("button", DYNAMIC_TRIGGER),
      ).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: "12.5" } });
      fireEvent.blur(input);
      expect(onChange).toHaveBeenCalledWith(12.5);
    });

    it("offers dynamic values", async () => {
      setup({ isDynamic: true });

      await userEvent.click(screen.getByRole("button", DYNAMIC_TRIGGER));

      expect(
        screen.getByRole("menuitem", { name: /Value from this question/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Value from another question/ }),
      ).toBeInTheDocument();
    });

    it("can hide values from this question", async () => {
      setup({ isDynamic: true, showSelfColumns: false });

      await userEvent.click(screen.getByRole("button", DYNAMIC_TRIGGER));

      expect(
        screen.queryByRole("menuitem", { name: /Value from this question/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Value from another question/ }),
      ).toBeInTheDocument();
    });
  });
});
