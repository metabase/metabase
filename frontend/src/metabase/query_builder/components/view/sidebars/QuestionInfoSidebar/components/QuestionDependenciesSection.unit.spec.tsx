import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type Question from "metabase-lib/v1/Question";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";

import { QuestionDependenciesSection } from "./QuestionDependenciesSection";

function setup({ question }: { question: Question }) {
  const adminUser = createMockUser({ is_superuser: true });

  renderWithProviders(
    <Route
      path="*"
      component={() => <QuestionDependenciesSection question={question} />}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: adminUser,
      },
    },
  );
}

function createMockQuestion(card = createMockCard()): Question {
  return {
    id: () => card.id,
    card: () => card,
    type: () => card.type,
    _card: card,
  } as unknown as Question;
}

describe("QuestionDependenciesSection (OSS)", () => {
  it("renders upsell card with title", () => {
    const question = createMockQuestion();
    setup({ question });

    expect(screen.getByText("Visualize dependencies")).toBeInTheDocument();
  });

  it("shows 'Try for free' button", () => {
    const question = createMockQuestion();
    setup({ question });

    expect(
      screen.getByRole("link", { name: /Try for free/i }),
    ).toBeInTheDocument();
  });

  it("shows description about understanding dependencies", () => {
    const question = createMockQuestion();
    setup({ question });

    expect(
      screen.getByText(
        /See how your data connects and understand the impact of changes/i,
      ),
    ).toBeInTheDocument();
  });

  it("links to upgrade URL with correct campaign parameters", () => {
    const question = createMockQuestion();
    setup({ question });

    const link = screen.getByRole("link", { name: /Try for free/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("utm_campaign=dependencies"),
    );
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("utm_content=question-info-sidebar"),
    );
  });

  it("shows 'Learn more' link to docs", () => {
    const question = createMockQuestion();
    setup({ question });

    expect(
      screen.getByRole("link", { name: /Learn more/i }),
    ).toBeInTheDocument();
  });
});
