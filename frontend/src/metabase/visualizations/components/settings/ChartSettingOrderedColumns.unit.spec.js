import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ORDERS } from "__support__/sample_database_fixture";
import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";

function renderChartSettingOrderedColumns(props) {
  render(
    <ChartSettingOrderedColumns
      onChange={() => {}}
      columns={[{ name: "Foo" }, { name: "Bar" }]}
      getColumnName={columnSetting => columnSetting.name}
      {...props}
    />,
  );
}

describe("ChartSettingOrderedColumns", () => {
  it("should have the correct add and remove buttons", () => {
    renderChartSettingOrderedColumns({
      value: [
        { name: "Foo", enabled: true },
        { name: "Bar", enabled: false },
      ],
    });
    expect(screen.getByRole("img", { name: /add/i })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /eye_outline/i }),
    ).toBeInTheDocument();
  });

  it("should add a column", () => {
    const onChange = jest.fn();
    renderChartSettingOrderedColumns({
      value: [
        { name: "Foo", enabled: true },
        { name: "Bar", enabled: false },
      ],
      onChange,
    });
    const ADD = screen.getByRole("img", { name: /add/i });

    userEvent.click(ADD);
    expect(onChange.mock.calls).toEqual([
      [
        [
          { name: "Foo", enabled: true },
          { name: "Bar", enabled: true },
        ],
      ],
    ]);
  });

  it("should remove a column", () => {
    const onChange = jest.fn();
    renderChartSettingOrderedColumns({
      value: [
        { name: "Foo", enabled: true },
        { name: "Bar", enabled: false },
      ],
      onChange,
    });
    const CLOSE = screen.getByRole("img", { name: /eye_outline/i });

    userEvent.click(CLOSE);
    expect(onChange.mock.calls).toEqual([
      [
        [
          { name: "Foo", enabled: false },
          { name: "Bar", enabled: false },
        ],
      ],
    ]);
  });

  describe("for structured queries", () => {
    it("should list and add additional columns", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [],
        columns: [],
        question: ORDERS.question(),
        onChange,
      });

      const ADD_ICONS = screen.getAllByRole("img", { name: /add/i });
      const FIRST = ADD_ICONS[0];

      expect(ADD_ICONS).toHaveLength(28);
      userEvent.click(FIRST);
      expect(onChange.mock.calls).toEqual([
        [[{ fieldRef: ["field", 1, null], enabled: true }]],
      ]);
    });
  });
});
