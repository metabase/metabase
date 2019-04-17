import React from "react";
import { shallow, mount } from "enzyme";

import Question from "metabase-lib/lib/Question";
import { delay } from "metabase/lib/promise";
import { CardApi } from "metabase/services";

// import the un-connected component so we can test its internal logic sans
// redux
import { SavedQuestionLoader } from "metabase/containers/SavedQuestionLoader";

// we need to mock the things that try and actually load the question
jest.mock("metabase/services");

describe("SavedQuestionLoader", () => {
  let loadQuestionSpy, loadMetadataSpy, mockChild;
  beforeEach(() => {
    // reset mocks between tests so we have fresh spies, etc
    jest.resetAllMocks();
    mockChild = jest.fn().mockReturnValue(<div />);
    loadMetadataSpy = jest.fn();
    loadQuestionSpy = jest.spyOn(
      SavedQuestionLoader.prototype,
      "_loadQuestion",
    );
  });

  it("should load a question given a questionId", async () => {
    const questionId = 1;
    const q = new Question.create({ databaseId: 1, tableId: 2 });
    jest.spyOn(CardApi, "get").mockReturnValue(q.card());

    const wrapper = mount(
      <SavedQuestionLoader
        questionId={questionId}
        loadMetadataForCard={loadMetadataSpy}
        children={mockChild}
      />,
    );
    expect(mockChild.mock.calls[0][0].loading).toEqual(true);
    expect(mockChild.mock.calls[0][0].error).toEqual(null);

    // stuff happens asynchronously
    wrapper.update();
    await delay(0);

    expect(loadQuestionSpy).toHaveBeenCalledWith(questionId);

    const calls = mockChild.mock.calls;
    const { question, loading, error } = calls[calls.length - 1][0];
    expect(question.card()).toEqual(q.card());
    expect(loading).toEqual(false);
    expect(error).toEqual(null);
  });

  it("should load a new question if the question ID changes", () => {
    const originalQuestionId = 1;
    const newQuestionId = 2;

    const wrapper = shallow(
      <SavedQuestionLoader
        questionId={originalQuestionId}
        loadMetadataForCard={loadMetadataSpy}
        children={mockChild}
      />,
    );

    expect(loadQuestionSpy).toHaveBeenCalledWith(originalQuestionId);

    // update the question ID, a new question id param in the url would do this
    wrapper.setProps({ questionId: newQuestionId });

    // question loading should begin with the new ID
    expect(loadQuestionSpy).toHaveBeenCalledWith(newQuestionId);
  });
});
