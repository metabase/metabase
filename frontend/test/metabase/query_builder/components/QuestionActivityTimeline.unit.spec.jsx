import React from "react";
import { render, screen } from "@testing-library/react";

import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";

describe("QuestionActivityTimeline", () => {
  let question;
  let revisions;
  let revertToRevision;
  beforeEach(() => {
    revisions = [
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

    revertToRevision = jest.fn().mockReturnValue(Promise.resolve());
  });

  describe("when the user does not have perms to modify the question", () => {
    beforeEach(() => {
      question = {
        canWrite: () => false,
      };

      render(
        <QuestionActivityTimeline
          question={question}
          revisions={revisions}
          revertToRevision={revertToRevision}
        />,
      );
    });

    it("should not render revert action buttons", () => {
      expect(() => screen.getByText("Revert")).toThrow();
    });
  });

  describe("when the user does have perms to modify the question", () => {
    beforeEach(() => {
      question = {
        canWrite: () => true,
      };

      render(
        <QuestionActivityTimeline
          question={question}
          revisions={revisions}
          revertToRevision={revertToRevision}
        />,
      );
    });

    it("should render revert action buttons", () => {
      expect(screen.getByText("Revert")).toBeInTheDocument();
    });

    it("should call revertToRevision when revert button is clicked", () => {
      screen.getByText("Revert").click();
      expect(revertToRevision).toHaveBeenCalled();
    });
  });
});
