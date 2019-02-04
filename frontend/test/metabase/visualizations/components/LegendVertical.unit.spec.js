import React from "react";
import LegendVertical from "metabase/visualizations/components/LegendVertical.jsx";
import { mount } from "enzyme";

describe("LegendVertical", () => {
  it("should render string titles correctly", () => {
    let legend = mount(<LegendVertical titles={["Hello"]} colors={["red"]} />);
    expect(legend.text()).toEqual("Hello");
  });
  it("should render array titles correctly", () => {
    let legend = mount(
      <LegendVertical titles={[["Hello", "world"]]} colors={["red"]} />,
    );
    expect(legend.text()).toEqual("Helloworld");
  });
});
