import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openOrdersTable,
  popover,
  restore,
  summarize,
} from "e2e/support/helpers";

describe("issue 17968", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show 'Previous results' instead of a table name for non-field dimensions (metabase#17968)", () => {
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();

    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().findByText("Created At").click();

    cy.findAllByTestId("action-buttons").last().button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    popover().findByText("Count").click();

    getNotebookStep("join", { stage: 1 })
      .findByLabelText("Left column")
      .findByText("Previous results");
  });
});
