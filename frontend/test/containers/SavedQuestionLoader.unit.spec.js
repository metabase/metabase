import React from "react";
import { shallow } from "enzyme";

// import the un-connected component so we can test its internal logic sans
// redux
import { SavedQuestionLoader } from "metabase/containers/SavedQuestionLoader";

// we need to mock the things that try and actually load the question
jest.mock("metabase/services");

describe("SavedQuestionLoader", () => {
  beforeEach(() => {
    // reset mocks between tests so we have fresh spies, etc
    jest.resetAllMocks();
  });

  it("should load a question given a questionId", () => {
    const questionId = 1;

    const loadSpy = jest.spyOn(SavedQuestionLoader.prototype, "_loadQuestion");

    shallow(
      <SavedQuestionLoader questionId={questionId}>
        {() => <div />}
      </SavedQuestionLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(questionId);
  });

  it("should load a new question if the question ID changes", () => {
    const originalQuestionId = 1;
    const newQuestionId = 2;

    const loadSpy = jest.spyOn(SavedQuestionLoader.prototype, "_loadQuestion");

    const wrapper = shallow(
      <SavedQuestionLoader questionId={originalQuestionId}>
        {() => <div />}
      </SavedQuestionLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(originalQuestionId);

    // update the question ID, a new question id param in the url would do this
    wrapper.setProps({ questionId: newQuestionId });

    // question loading should begin with the new ID
    expect(loadSpy).toHaveBeenCalledWith(newQuestionId);
  });
});
