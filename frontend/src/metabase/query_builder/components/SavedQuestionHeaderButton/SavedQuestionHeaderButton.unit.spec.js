import userEvent from "@testing-library/user-event";

import { setupEnterpriseTest } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, getIcon } from "__support__/ui";

import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";

import SavedQuestionHeaderButton from "./SavedQuestionHeaderButton";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

function setup({ question }) {
  const onSave = jest.fn();

  renderWithProviders(
    <SavedQuestionHeaderButton question={question} onSave={onSave} />,
  );

  return { onSave };
}

describe("SavedQuestionHeaderButton", () => {
  const question = new Question(
    {
      name: "foo",
      moderation_reviews: [],
      can_write: true,
    },
    metadata,
  );

  it("renders the name of the question", () => {
    setup({ question });
    expect(screen.getByText("foo")).toBeInTheDocument();
  });

  it("calls onSave on input blur", () => {
    const { onSave } = setup({ question });

    const title = screen.getByTestId("saved-question-header-title");
    userEvent.type(title, "1");
    title.blur();

    expect(onSave).toHaveBeenCalled();
  });

  describe("when the question does not have a latest moderation review", () => {
    it("should contain no additional icons", () => {
      setup({ question });
      expect(screen.queryAllByLabelText(/icon/)).toEqual([]);
    });
  });

  describe("when the question has a latest moderation review", () => {
    const question = new Question({
      name: "foo",
      moderation_reviews: [
        { status: null },
        { most_recent: true, status: "verified" },
      ],
    });

    it("should have an additional icon to signify the question's moderation status", () => {
      setupEnterpriseTest();
      setup({ question });
      expect(getIcon("verified")).toBeInTheDocument();
    });
  });
});
