import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { SavedQuestionHeaderButton } from "./SavedQuestionHeaderButton";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

function setup({ question, tokenFeatures = {}, enterprisePlugins }) {
  const onSave = jest.fn();

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <SavedQuestionHeaderButton question={question} onSave={onSave} />,
    {
      storeInitialState: state,
    },
  );

  return { onSave };
}

describe("SavedQuestionHeaderButton", () => {
  const question = new Question(
    {
      name: "foo",
      moderation_reviews: [],
      can_write: true,
      collection: createMockCollection(),
    },
    metadata,
  );

  it("renders the name of the question", () => {
    setup({ question });
    expect(screen.getByText("foo")).toBeInTheDocument();
  });

  it("calls onSave on input blur", async () => {
    const { onSave } = setup({ question });

    const titleInput = screen.getByTestId("saved-question-header-title");
    await userEvent.type(titleInput, "1");
    titleInput.blur();

    expect(onSave).toHaveBeenCalled();
  });

  it("should prevent names with more than 254 characters", async () => {
    const { onSave } = setup({ question });

    const titleInput = screen.getByTestId("saved-question-header-title");
    await userEvent.clear(titleInput);
    await userEvent.paste("A".repeat(300));
    titleInput.blur();

    expect(onSave).toHaveBeenCalledWith("A".repeat(254));
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
      collection: createMockCollection(),
    });

    it("should have an additional icon to signify the question's moderation status", () => {
      setup({
        question,
        tokenFeatures: {
          content_verification: true,
        },
        enterprisePlugins: ["content-verification", "moderation"],
      });
      expect(getIcon("verified")).toBeInTheDocument();
    });
  });

  describe("when the question is in an instance analytics collection", () => {
    const question = new Question(
      {
        name: "foo",
        collection: createMockCollection({
          id: "1",
          type: "instance-analytics",
        }),
      },
      metadata,
    );

    it("should have an additional icon to signify the question's collection type", () => {
      setup({
        question,
        tokenFeatures: { audit_app: true },
        enterprisePlugins: ["collections", "audit-app"],
      });
      expect(getIcon("audit")).toBeInTheDocument();
    });
  });
});
