import React from "react";
import { render } from "@testing-library/react";

import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";
import { buildQuestion } from "metabase-lib/Question";

describe("QuestionResultLoader", () => {
  it("should load a result given a question", () => {
    const question = buildQuestion({
      card: {
        id: 1,
      },
    });

    const loadSpy = jest.spyOn(QuestionResultLoader.prototype, "_loadResult");

    render(
      <QuestionResultLoader question={question}>
        {() => <div />}
      </QuestionResultLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(question, undefined, false);
  });
});
