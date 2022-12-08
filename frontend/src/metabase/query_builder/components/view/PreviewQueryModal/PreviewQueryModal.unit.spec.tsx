import React from "react";
import xhrMock from "xhr-mock";
import { render, screen } from "@testing-library/react";
import Question from "metabase-lib/Question";
import PreviewQueryModal from "./PreviewQueryModal";

const SQL_QUERY = "SELECT 1";
const SQL_QUERY_ERROR = "Cannot run the query";

describe("PreviewQueryModal", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("should show a fully parameterized native query", async () => {
    const question = Question.create({ databaseId: 1 });
    mockNativeQuery();

    render(<PreviewQueryModal question={question} />);

    expect(await screen.findByText(SQL_QUERY)).toBeInTheDocument();
  });

  it("should show a native query error", async () => {
    const question = Question.create({ databaseId: 1 });
    mockNativeQueryError();

    render(<PreviewQueryModal question={question} />);

    expect(await screen.findByText(SQL_QUERY_ERROR)).toBeInTheDocument();
  });
});

const mockNativeQuery = () => {
  xhrMock.post("/api/dataset/native", {
    status: 200,
    body: JSON.stringify({
      query: "SELECT 1",
    }),
  });
};

const mockNativeQueryError = () => {
  xhrMock.post("/api/dataset/native", {
    status: 500,
    body: JSON.stringify({
      message: SQL_QUERY_ERROR,
    }),
  });
};
