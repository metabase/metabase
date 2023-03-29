import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockUser } from "metabase-types/api/mocks";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";

const REVISIONS = [
  {
    is_reversion: true,
    description: "bar",
    timestamp: "2016-05-08T02:02:07.441Z",
    user: {
      common_name: "Bar",
    },
  },
  {
    is_creation: true,
    description: "foo",
    timestamp: "2016-04-08T02:02:07.441Z",
    user: {
      common_name: "Foo",
    },
  },
];

function setup({ question }) {
  const revertToRevision = jest.fn().mockReturnValue(Promise.resolve());
  render(
    <QuestionActivityTimeline
      question={question}
      revisions={REVISIONS}
      currentUser={createMockUser()}
      revertToRevision={revertToRevision}
    />,
  );
  return { revertToRevision };
}

describe("QuestionActivityTimeline", () => {
  describe("when the user does not have perms to modify the question", () => {
    const question = {
      canWrite: () => false,
      getModerationReviews: () => [],
    };

    it("should not render revert action buttons", () => {
      setup({ question });
      expect(() => screen.getByTestId("question-revert-button")).toThrow();
    });
  });

  describe("when the user does have perms to modify the question", () => {
    const question = {
      canWrite: () => true,
      getModerationReviews: () => [],
    };

    it("should render revert action buttons", () => {
      setup({ question });
      expect(screen.getByTestId("question-revert-button")).toBeInTheDocument();
    });

    it("should call revertToRevision when revert button is clicked", () => {
      const { revertToRevision } = setup({ question });
      userEvent.click(screen.getByTestId("question-revert-button"));
      expect(revertToRevision).toHaveBeenCalled();
    });
  });
});
