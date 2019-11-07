import { click } from "__support__/enzyme";

import React from "react";
import { shallow } from "enzyme";
import NewUserOnboardingModal from "metabase/home/components/NewUserOnboardingModal";

describe("new user onboarding modal", () => {
  describe("advance steps", () => {
    it("should advance through steps properly", () => {
      const wrapper = shallow(<NewUserOnboardingModal />);
      const nextButton = wrapper.find("a");

      expect(wrapper.state().step).toEqual(1);
      click(nextButton);
      expect(wrapper.state().step).toEqual(2);
    });

    it("should close if on the last step", () => {
      const onClose = jest.fn();
      const wrapper = shallow(<NewUserOnboardingModal onClose={onClose} />);
      // go to the last step
      wrapper.setState({ step: 3 });

      const nextButton = wrapper.find("a");
      expect(nextButton.text()).toEqual("Let's go");
      click(nextButton);
      expect(onClose.mock.calls.length).toEqual(1);
    });
  });
});
