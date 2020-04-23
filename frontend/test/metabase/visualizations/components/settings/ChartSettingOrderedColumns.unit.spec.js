import React from "react";

import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";

import { mount } from "enzyme";

import { ORDERS } from "__support__/sample_dataset_fixture.js";

function renderChartSettingOrderedColumns(props) {
  return mount(
    <ChartSettingOrderedColumns
      onChange={() => {}}
      columns={[{ name: "Foo" }, { name: "Bar" }]}
      {...props}
    />,
  );
}

describe("ChartSettingOrderedColumns", () => {
  it("should have the correct add and remove buttons", () => {
    const setting = renderChartSettingOrderedColumns({
      value: [{ name: "Foo", enabled: true }, { name: "Bar", enabled: false }],
    });
    expect(setting.find(".Icon-add")).toHaveLength(1);
    expect(setting.find(".Icon-close")).toHaveLength(1);
  });
  it("should add a column", () => {
    const onChange = jest.fn();
    const setting = renderChartSettingOrderedColumns({
      value: [{ name: "Foo", enabled: true }, { name: "Bar", enabled: false }],
      onChange,
    });
    setting.find(".Icon-add").simulate("click");
    expect(onChange.mock.calls).toEqual([
      [[{ name: "Foo", enabled: true }, { name: "Bar", enabled: true }]],
    ]);
  });
  it("should remove a column", () => {
    const onChange = jest.fn();
    const setting = renderChartSettingOrderedColumns({
      value: [{ name: "Foo", enabled: true }, { name: "Bar", enabled: false }],
      onChange,
    });
    setting.find(".Icon-close").simulate("click");
    expect(onChange.mock.calls).toEqual([
      [[{ name: "Foo", enabled: false }, { name: "Bar", enabled: false }]],
    ]);
  });
  it("should reorder columns", () => {
    const onChange = jest.fn();
    const setting = renderChartSettingOrderedColumns({
      value: [{ name: "Foo", enabled: true }, { name: "Bar", enabled: true }],
      onChange,
    });
    // just call handleSortEnd directly for now as it's difficult to simulate drag and drop
    setting.instance().handleSortEnd({ oldIndex: 1, newIndex: 0 });
    expect(onChange.mock.calls).toEqual([
      [[{ name: "Bar", enabled: true }, { name: "Foo", enabled: true }]],
    ]);
  });

  describe("for structured queries", () => {
    it("should list and add additional columns", () => {
      const onChange = jest.fn();
      const setting = renderChartSettingOrderedColumns({
        value: [],
        columns: [],
        question: ORDERS.question(),
        onChange,
      });
      expect(setting.find(".Icon-add")).toHaveLength(28);
      setting
        .find(".Icon-add")
        .first()
        .simulate("click");
      expect(onChange.mock.calls).toEqual([
        [[{ fieldRef: ["field-id", 1], enabled: true }]],
      ]);
    });
  });
});
