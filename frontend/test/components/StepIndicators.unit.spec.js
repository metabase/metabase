import { click } from "__support__/enzyme_utils";

import React from "react";
import { shallow } from "enzyme";

import { normal } from "metabase/lib/colors";

import StepIndicators from "../../src/metabase/components/StepIndicators";

describe("Step indicators", () => {
  let steps = [{}, {}, {}];

  it("should render as many indicators as steps", () => {
    const wrapper = shallow(<StepIndicators steps={steps} />);

    expect(wrapper.find("li").length).toEqual(steps.length);
  });

  it("should indicate the current step", () => {
    const wrapper = shallow(<StepIndicators steps={steps} currentStep={1} />);

    expect(wrapper.find("li").get(0).props.style.backgroundColor).toEqual(
      normal.blue,
    );
  });

  describe("goToStep", () => {
    it("should call goToStep with the proper number when a step is clicked", () => {
      const goToStep = jest.fn();
      const wrapper = shallow(
        <StepIndicators steps={steps} goToStep={goToStep} currentStep={1} />,
      );

      const targetIndicator = wrapper.find("li").first();
      click(targetIndicator);
      expect(goToStep).toHaveBeenCalledWith(1);
    });
  });
});
