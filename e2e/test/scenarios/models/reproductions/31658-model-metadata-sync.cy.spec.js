import {
  openQuestionActions,
  popover,
  restore,
  summarize,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 21658", function () {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show other models ID columns as possible PKs", () => {
    cy.createQuestion(
      {
        name: "[Model] Orders",
        dataset: true,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Product ID").click();

    cy.get("#formField-fk_target_field_id")
      .should("have.text", "Products → ID")
      .click();

    popover()
      .findAllByRole("option")
      .each($option => {
        cy.wrap($option).should("not.contain.text", "[Model]");
      });
  });

  it("should show all linked model dimensions to use for filtering", () => {
    cy.createQuestion(
      {
        name: "[Model] Orders",
        dataset: true,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Product ID").click();

    cy.get("#formField-fk_target_field_id")
      .should("have.text", "Products → ID")
      .click();

    popover().findByText("Products → ID").click();

    cy.findByTestId("dataset-edit-bar").findByText("Save changes").click();

    cy.wait("@dataset");

    cy.findByTestId("qb-header").within(() => {
      cy.icon("notebook").click();
    });

    cy.findByTestId("action-buttons").findByText("Filter").click();

    popover().within(() => {
      cy.findByText("User").should("be.visible").click();
      cy.findAllByTestId("dimension-list-item").should("have.length", 13);

      cy.findByText("Product").should("be.visible").click();
      cy.findAllByTestId("dimension-list-item").should("have.length", 8);
    });

    cy.realPress("{esc}"); // close filter popover

    summarize({ mode: "notebook" });

    popover().findByText("Count of rows").click();

    cy.findByTestId("step-summarize-0-0")
      .findByText("Pick a column to group by")
      .click();

    popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });

    visualize(() => {
      cy.get(".LineAreaBarChart").should("be.visible");
    });
  });
});
