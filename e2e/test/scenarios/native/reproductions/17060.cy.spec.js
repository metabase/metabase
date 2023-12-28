import { restore, openNativeEditor } from "e2e/support/helpers";

import { runQuery } from "../../native-filters/helpers/e2e-sql-filter-helpers";

const ORIGINAL_QUERY = `select ID as "num", CATEGORY as "text" from PRODUCTS limit 1`;
const SECTION = "select ";
const SELECTED_TEXT = "ID";

const moveCursorToBeginning = "{selectall}{leftarrow}";

const highlightSelectedText = "{shift}{rightarrow}".repeat(
  SELECTED_TEXT.length,
);

const moveCursorAfterSection = "{rightarrow}".repeat(SECTION.length);

describe("issue 17060", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openNativeEditor().type(ORIGINAL_QUERY);

    runQuery();

    cy.findByTestId("viz-settings-button").click();

    cy.findByTestId("sidebar-left").within(() => {
      rearrangeColumns();
    });
  });

  it("should not render duplicated columns (metabase#17060)", () => {
    cy.get("@editor").type(
      moveCursorToBeginning +
        moveCursorAfterSection +
        highlightSelectedText +
        "RATING",
      { delay: 50 },
    );

    runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("num");
    });
  });
});

function rearrangeColumns() {
  cy.findAllByTestId(/draggable-item/)
    .first()
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", 5, 5, { force: true })
    .trigger("mousemove", 0, 100, { force: true })
    .trigger("mouseup", 0, 100, { force: true });
}
