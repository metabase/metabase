import { renderWithProviders, screen, within } from "__support__/ui";
import * as Urls from "metabase/urls";

import { SemanticDuplicatesTable } from "./SemanticDuplicatesTable";

describe("SemanticDuplicatesTable", () => {
  it("renders question links and all their matches in the same table row", () => {
    const question = { id: 1, name: "Orders by month" };
    const duplicates = [
      { id: 2, name: "Monthly orders" },
      { id: 3, name: "Orders over time" },
    ];

    renderWithProviders(
      <SemanticDuplicatesTable rows={[{ question, duplicates }]} />,
      { withRouter: true },
    );

    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Question", "Potential duplicates"]);

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    const cells = within(rows[1]).getAllByRole("cell");
    expect(
      within(cells[0]).getByRole("link", { name: question.name }),
    ).toHaveAttribute("href", Urls.card(question));
    expect(within(cells[1]).getAllByRole("link")).toHaveLength(2);
    for (const duplicate of duplicates) {
      expect(
        within(cells[1]).getByRole("link", { name: duplicate.name }),
      ).toHaveAttribute("href", Urls.card(duplicate));
    }
  });
});
