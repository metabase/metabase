import React from "react";
import xhrMock from "xhr-mock";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Question from "metabase-lib/Question";
import ConvertQueryModal from "./ConvertQueryModal";

const SQL_QUERY = "SELECT 1";

describe("ConvertQueryModal", () => {
  beforeEach(() => {
    xhrMock.setup();
    mockNativeQuery();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("should show a native query for a structured query", async () => {
    const question = Question.create({ databaseId: 1 });

    render(<ConvertQueryModal question={question} />);

    expect(await screen.findByText(SQL_QUERY)).toBeInTheDocument();
  });

  it("should allow to convert a structured query to a native query", async () => {
    const question = Question.create({ databaseId: 1 });
    const onUpdateQuestion = jest.fn();

    render(
      <ConvertQueryModal
        question={question}
        onUpdateQuestion={onUpdateQuestion}
      />,
    );
    userEvent.click(await screen.findByText("Convert this question to SQL"));

    expect(onUpdateQuestion).toHaveBeenCalledWith(
      question.setDatasetQuery({
        type: "native",
        database: 1,
        native: {
          query: SQL_QUERY,
          "template-tags": {},
        },
      }),
      { shouldUpdateUrl: true },
    );
  });
});

const mockNativeQuery = () => {
  xhrMock.post("/api/dataset/native", {
    status: 200,
    body: JSON.stringify({
      query: SQL_QUERY,
    }),
  });
};
