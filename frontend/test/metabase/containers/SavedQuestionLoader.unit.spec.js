import React from "react";
import { render } from "@testing-library/react";

import { delay } from "metabase/lib/promise";

// import the un-connected component so we can test its internal logic sans
// redux
import { SavedQuestionLoader } from "metabase/containers/SavedQuestionLoader";
import Question from "metabase-lib/Question";

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
    const q = Question.create({ databaseId: 1, tableId: 2 });
    const mockFetchQuestion = jest
      .fn()
      .mockResolvedValue(q._doNotCallSerializableCard());

    render(
      <SavedQuestionLoader
        questionId={questionId}
        loadMetadataForCard={loadMetadataSpy}
        fetchQuestion={mockFetchQuestion}
      >
        {mockChild}
      </SavedQuestionLoader>,
    );
    expect(mockChild.mock.calls[0][0].loading).toEqual(true);
    expect(mockChild.mock.calls[0][0].error).toEqual(null);

    // stuff happens asynchronously
    await delay(0);

    expect(loadQuestionSpy).toHaveBeenCalledWith(questionId);

    const calls = mockChild.mock.calls;
    const { question, loading, error } = calls[calls.length - 1][0];
    expect(question.isEqual(q)).toBe(true);
    expect(loading).toEqual(false);
    expect(error).toEqual(null);
  });

  it("should load a new question if the question ID changes", () => {
    const originalQuestionId = 1;
    const newQuestionId = 2;

    const { rerender } = render(
      <SavedQuestionLoader
        questionId={originalQuestionId}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </SavedQuestionLoader>,
    );

    expect(loadQuestionSpy).toHaveBeenCalledWith(originalQuestionId);

    // update the question ID, a new question id param in the url would do this
    rerender(
      <SavedQuestionLoader
        questionId={newQuestionId}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </SavedQuestionLoader>,
    );

    // question loading should begin with the new ID
    expect(loadQuestionSpy).toHaveBeenCalledWith(newQuestionId);
  });
});
