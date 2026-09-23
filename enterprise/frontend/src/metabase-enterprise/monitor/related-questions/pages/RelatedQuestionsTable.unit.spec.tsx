import { renderWithProviders, screen, within } from "__support__/ui";
import * as Urls from "metabase/urls";

import { RelatedQuestionsTable } from "./RelatedQuestionsTable";

describe("RelatedQuestionsTable", () => {
  it("renders question links and all their matches in the same table row", () => {
    const question = { id: 1, name: "Orders by month" };
    const relatedQuestions = [
      { id: 2, name: "Monthly orders" },
      { id: 3, name: "Orders over time" },
    ];

    renderWithProviders(
      <RelatedQuestionsTable
        rows={[{ question, related_questions: relatedQuestions }]}
      />,
      { withRouter: true },
    );

    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Question", "Related questions"]);

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    const cells = within(rows[1]).getAllByRole("cell");
    expect(
      within(cells[0]).getByRole("link", { name: question.name }),
    ).toHaveAttribute("href", Urls.card(question));
    expect(within(cells[1]).getAllByRole("link")).toHaveLength(2);
    for (const relatedQuestion of relatedQuestions) {
      expect(
        within(cells[1]).getByRole("link", { name: relatedQuestion.name }),
      ).toHaveAttribute("href", Urls.card(relatedQuestion));
    }
  });
});
