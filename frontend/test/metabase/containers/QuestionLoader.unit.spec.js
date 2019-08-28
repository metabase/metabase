import React from "react";
import { shallow } from "enzyme";

import QuestionLoader from "metabase/containers/QuestionLoader";

import AdHocQuestionLoader from "metabase/containers/AdHocQuestionLoader";
import SavedQuestionLoader from "metabase/containers/SavedQuestionLoader";

describe("QuestionLoader", () => {
  describe("initial load", () => {
    it("should use SavedQuestionLoader if there is a saved question", () => {
      const wrapper = shallow(
        <QuestionLoader questionId={1}>{() => <div />}</QuestionLoader>,
      );

      expect(wrapper.find(SavedQuestionLoader).length).toBe(1);
    });

    it("should use AdHocQuestionLoader if there is an ad-hoc question", () => {
      const wrapper = shallow(
        <QuestionLoader questionHash={"#abc123"}>
          {() => <div />}
        </QuestionLoader>,
      );

      expect(wrapper.find(AdHocQuestionLoader).length).toBe(1);
    });
  });
  describe("subsequent movement", () => {
    it("should transition between loaders when props change", () => {
      // start with a quesitonId
      const wrapper = shallow(
        <QuestionLoader questionId={4}>{() => <div />}</QuestionLoader>,
      );

      expect(wrapper.find(SavedQuestionLoader).length).toBe(1);

      wrapper.setProps({
        questionId: undefined,
        questionHash: "#abc123",
      });

      expect(wrapper.find(AdHocQuestionLoader).length).toBe(1);
    });
  });
});
