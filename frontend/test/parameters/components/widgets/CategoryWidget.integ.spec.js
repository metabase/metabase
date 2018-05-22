import "__support__/integrated_tests";

import React from "react";

import CategoryWidget from "metabase/parameters/components/widgets/CategoryWidget";

import { mount } from "enzyme";
import { click, clickButton } from "__support__/enzyme_utils";

const VALUES = [["First"], ["Second"], ["Third"]];

const ON_SET_VALUE = jest.fn();

function renderCategoryWidget(props) {
  return mount(
    <CategoryWidget
      values={VALUES}
      setValue={ON_SET_VALUE}
      onClose={() => {}}
      {...props}
    />,
  );
}

describe("CategoryWidget", () => {
  describe("with a selected value", () => {
    it("should render with selected value checked", () => {
      let categoryWidget = renderCategoryWidget({ value: VALUES[0] });
      expect(categoryWidget.find(".Icon-check").length).toEqual(1);
      categoryWidget
        .find("label")
        .findWhere(label => label.text().match(/First/))
        .find(".Icon-check")
        .exists();
    });
  });

  describe("without a selected value", () => {
    it("should render with selected value checked", () => {
      let categoryWidget = renderCategoryWidget({ value: [] });
      expect(categoryWidget.find(".Icon-check").length).toEqual(0);
    });
  });

  describe("selecting values", () => {
    it("should mark the values as selected", () => {
      let categoryWidget = renderCategoryWidget({ value: [] });
      // Check option 1
      click(categoryWidget.find("label").at(0));
      expect(categoryWidget.find(".Icon-check").length).toEqual(1);

      // Check option 2
      click(categoryWidget.find("label").at(1));
      expect(categoryWidget.find(".Icon-check").length).toEqual(2);

      clickButton(categoryWidget.find(".Button"));

      expect(ON_SET_VALUE).toHaveBeenCalledWith(["First", "Second"]);

      // Un-check option 1
      click(categoryWidget.find("label").at(0));
      expect(categoryWidget.find(".Icon-check").length).toEqual(1);

      clickButton(categoryWidget.find(".Button"));

      expect(ON_SET_VALUE).toHaveBeenCalledWith(["Second"]);
    });
  });

  describe("selecting no values", () => {
    it("selected values should be null", () => {
      let categoryWidget = renderCategoryWidget({ value: [] });
      // Check option 1
      click(categoryWidget.find("label").at(0));
      clickButton(categoryWidget.find(".Button"));
      expect(ON_SET_VALUE).toHaveBeenCalledWith(["First"]);

      // un-check option 1
      click(categoryWidget.find("label").at(0));
      clickButton(categoryWidget.find(".Button"));
      expect(ON_SET_VALUE).toHaveBeenCalledWith(null);
    });
  });
});
