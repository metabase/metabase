import React from "react";
import { shallow } from "enzyme";

import Question from "metabase-lib/lib/Question";
import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";

describe("QuestionResultLoader", () => {
  it("should load a result given a question", () => {
    const question = new Question({
      id: 1,
    });

    const loadSpy = jest.spyOn(QuestionResultLoader.prototype, "_loadResult");

    shallow(
      <QuestionResultLoader question={question}>
        {() => <div />}
      </QuestionResultLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(question, undefined);
  });
});
