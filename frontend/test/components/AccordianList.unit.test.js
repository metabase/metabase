import React from "react";
import { mount } from "enzyme";

import AccordianList from "metabase/components/AccordianList";
import ListSearchField from "metabase/components/ListSearchField";

const SECTIONS = [
  {
    name: "Widgets",
    items: [{ name: "Foo" }, { name: "Bar" }],
  },
  {
    name: "Doohickeys",
    items: [{ name: "Baz" }],
  },
];

describe("AccordianList", () => {
  it("should open the first section by default", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} />);
    expect(wrapper.find(".List-section-header").length).toBe(2);
    expect(wrapper.find(".List-item").length).toBe(2);
  });
  it("should open the second section if initiallyOpenSection=1", () => {
    const wrapper = mount(
      <AccordianList sections={SECTIONS} initiallyOpenSection={1} />,
    );
    expect(wrapper.find(".List-item").length).toBe(1);
  });
  it("should not open a section if initiallyOpenSection=null", () => {
    const wrapper = mount(
      <AccordianList sections={SECTIONS} initiallyOpenSection={null} />,
    );
    expect(wrapper.find(".List-item").length).toBe(0);
  });
  it("should open all sections if alwaysExpanded is set", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} alwaysExpanded />);
    expect(wrapper.find(".List-item").length).toBe(3);
  });
  it("should not show search field by default", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} />);
    expect(wrapper.find(ListSearchField).length).toBe(0);
  });
  it("should show search field is searchable is set", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} searchable />);
    expect(wrapper.find(ListSearchField).length).toBe(1);
  });
  it("should close the section when header is clicked", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} />);
    expect(wrapper.find(".List-item").length).toBe(2);
    wrapper
      .find(".List-section-header")
      .first()
      .simulate("click");
    expect(wrapper.find(".List-item").length).toBe(0);
  });
  it("should switch sections when another section is clicked", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} />);
    expect(wrapper.find(".List-item").length).toBe(2);
    wrapper
      .find(".List-section-header")
      .last()
      .simulate("click");
    expect(wrapper.find(".List-item").length).toBe(1);
  });
  it("should filter items when searched", () => {
    const wrapper = mount(<AccordianList sections={SECTIONS} searchable />);
    const searchInput = wrapper.find(ListSearchField).find("input");
    expect(wrapper.find(".List-item").length).toBe(2);
    searchInput.simulate("change", { target: { value: "Foo" } });
    expect(wrapper.find(".List-item").length).toBe(1);
    searchInput.simulate("change", { target: { value: "Something Else" } });
    expect(wrapper.find(".List-item").length).toBe(0);
  });
});
