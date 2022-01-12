import {
  restore,
  getNotebookStep,
  runNativeQuery,
} from "__support__/e2e/cypress";

import {
  selectFromDropdown,
  openDetailsSidebar,
} from "./helpers/e2e-datasets-helpers";

describe("scenarios > datasets query editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows to edit GUI dataset query", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/dataset/1");

    openDetailsSidebar();
    cy.findByText("Edit query definition").click();

    getNotebookStep("data").findByText("Orders");
    cy.get(".TableInteractive");
    cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);

    cy.findByTestId("action-buttons")
      .findByText("Summarize")
      .click();
    selectFromDropdown("Count of rows");
    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    cy.get(".RunButton").click();

    cy.get(".TableInteractive").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });
    cy.get(".TableInteractive-headerCellData").should("have.length", 2);

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.url().should("include", "/dataset/1");
    cy.url().should("not.include", "/query");

    cy.visit("/dataset/1/query");
    getNotebookStep("summarize").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });
    cy.get(".TableInteractive").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });

    cy.button("Cancel").click();
    cy.url().should("include", "/dataset/1");
    cy.url().should("not.include", "/query");

    cy.go("back");
    cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);
  });

  it("locks display to table", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/dataset/1/query");

    cy.findByTestId("action-buttons")
      .findByText("Join data")
      .click();
    selectFromDropdown("People");

    cy.button("Save changes").click();
    openDetailsSidebar();
    cy.findByText("Edit query definition").click();

    cy.findByTestId("action-buttons")
      .findByText("Summarize")
      .click();
    selectFromDropdown("Count of rows");
    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    cy.get(".RunButton").click();
    cy.wait("@dataset");

    cy.get(".LineAreaBarChart").should("not.exist");
    cy.get(".TableInteractive");
  });

  it("allows to edit native dataset query", () => {
    cy.createNativeQuestion(
      {
        name: "Native DS",
        dataset: true,
        native: {
          query: "SELECT * FROM orders",
        },
      },
      { visitQuestion: true },
    );

    openDetailsSidebar();
    cy.findByText("Edit query definition").click();

    cy.get(".ace_content").as("editor");
    cy.get(".TableInteractive");
    cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);

    cy.get("@editor").type(
      " LEFT JOIN products ON orders.PRODUCT_ID = products.ID",
    );
    runNativeQuery();

    cy.get(".TableInteractive").within(() => {
      cy.findByText("EAN");
      cy.findByText("TOTAL");
    });

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.url().should("match", /\/dataset\/[1-9]\d*.*\d/);
    cy.url().should("not.include", "/query");

    cy.findByText("Edit query definition").click();

    cy.get(".TableInteractive").within(() => {
      cy.findByText("EAN");
      cy.findByText("TOTAL");
    });

    cy.button("Cancel").click();
    cy.url().should("match", /\/dataset\/[1-9]\d*.*\d/);
    cy.url().should("not.include", "/query");
  });
});
