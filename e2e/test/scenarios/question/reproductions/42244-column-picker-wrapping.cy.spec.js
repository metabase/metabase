import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getNotebookStep,
  openOrdersTable,
  popover,
  restore,
  summarize,
} from "e2e/support/helpers";

const { ORDERS } = SAMPLE_DATABASE;

const COLUMN_NAME = "Created At".repeat(5);

describe("issue 42244", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  it("should allow to change the temporal bucket when the column name is long (metabase#42244)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().within(() => {
      cy.findByText(COLUMN_NAME).realHover();
      cy.findByText("by month").should("be.visible").click();
    });
    popover().last().findByText("Year").click();
    getNotebookStep("summarize")
      .findByText(`${COLUMN_NAME}: Year`)
      .should("be.visible");
  });
});
