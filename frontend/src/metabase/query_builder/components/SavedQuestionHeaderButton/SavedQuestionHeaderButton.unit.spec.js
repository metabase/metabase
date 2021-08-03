import React from "react";

import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import SavedQuestionHeaderButton from "./SavedQuestionHeaderButton";

describe("SavedQuestionHeaderButton", () => {
  let onClick;
  let question;
  let componentContainer;

  beforeEach(() => {
    onClick = jest.fn();
    question = {
      displayName: () => "foo",
      getModerationReviews: () => [],
    };

    const { container } = render(
      <SavedQuestionHeaderButton
        question={question}
        onClick={onClick}
        isActive={false}
      />,
    );

    componentContainer = container;
  });

  it("renders the name of the question", () => {
    expect(screen.getByText("foo")).toBeInTheDocument();
  });

  it("is clickable", () => {
    screen.getByText("foo").click();
    expect(onClick).toHaveBeenCalled();
  });

  describe("when the question does not have a latest moderation review", () => {
    it("should contain no additional icons", () => {
      expect(
        componentContainer.querySelector(".Icon:not(.Icon-chevrondown)"),
      ).toEqual(null);
    });
  });

  describe("when the question has a latest moderation review", () => {
    beforeEach(() => {
      question = {
        displayName: () => "foo",
        getModerationReviews: () => [
          { status: null },
          { most_recent: true, status: "verified" },
        ],
      };

      const { container } = render(
        <SavedQuestionHeaderButton
          question={question}
          onClick={onClick}
          isActive={false}
        />,
      );

      componentContainer = container;
    });

    it("should have an additional icon to signify the question's moderation status", () => {
      expect(
        componentContainer.querySelector(".Icon:not(.Icon-chevrondown)"),
      ).toBeDefined();
    });
  });
});
