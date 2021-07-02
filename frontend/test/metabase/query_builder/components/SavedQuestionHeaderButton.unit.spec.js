import React from "react";

import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton";

describe("SavedQuestionHeaderButton", () => {
  let onClick;
  let question;
  beforeEach(() => {
    onClick = jest.fn();
    question = {
      displayName: () => "foo",
    };

    render(
      <SavedQuestionHeaderButton
        question={question}
        onClick={onClick}
        isActive={false}
      />,
    );
  });

  it("renders the name of the question", () => {
    expect(screen.getByText("foo")).toBeInTheDocument();
  });

  it("is clickable", () => {
    screen.getByText("foo").click();
    expect(onClick).toHaveBeenCalled();
  });
});
