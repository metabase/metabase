import { render } from "@testing-library/react";

import { setupCardQueryEndpoints } from "__support__/server-mocks";
import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";
import Question from "metabase-lib/v1/Question";
import { createMockDataset } from "metabase-types/api/mocks";

describe("QuestionResultLoader", () => {
  it("should load a result given a question", () => {
    const question = new Question({
      id: 1,
    });
    setupCardQueryEndpoints(question.card(), createMockDataset());

    const loadSpy = jest.spyOn(QuestionResultLoader.prototype, "_loadResult");

    render(
      <QuestionResultLoader question={question}>
        {() => <div />}
      </QuestionResultLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(question, undefined, false);
  });
});
