import {
  restore,
  getNotebookStep,
  runNativeQuery,
} from "__support__/e2e/cypress";

import {
  selectFromDropdown,
  openDetailsSidebar,
} from "./helpers/e2e-models-helpers";

describe("scenarios > models query editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows to edit GUI model query", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/model/1");

    openDetailsSidebar();
    cy.findByText("Edit query definition").click();

    getNotebookStep("data").findByText("Orders");
    cy.get(".TableInteractive");
    cy.url().should("match", /\/model\/[1-9]\d*.*\/query/);

    cy.findByTestId("action-buttons")
      .findByText("Summarize")
      .click();
    selectFromDropdown("Count of rows");
    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    cy.get(".RunButton")
      .should("be.visible")
      .click();

    cy.get(".TableInteractive").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });
    cy.get(".TableInteractive-headerCellData").should("have.length", 2);

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.url().should("include", "/model/1");
    cy.url().should("not.include", "/query");

    cy.visit("/model/1/query");
    getNotebookStep("summarize").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });
    cy.get(".TableInteractive").within(() => {
      cy.findByText("Created At: Month");
      cy.findByText("Count");
    });

    cy.button("Cancel").click();
    cy.url().should("include", "/model/1");
    cy.url().should("not.include", "/query");

    cy.go("back");
    cy.url().should("match", /\/model\/[1-9]\d*.*\/query/);
  });

  it("locks display to table", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/model/1/query");

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

    cy.get(".RunButton")
      .should("be.visible")
      .click();
    cy.wait("@dataset");

    cy.get(".LineAreaBarChart").should("not.exist");
    cy.get(".TableInteractive");
  });

  it("allows to edit native model query", () => {
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
    cy.url().should("match", /\/model\/[1-9]\d*.*\/query/);

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

    cy.url().should("match", /\/model\/[1-9]\d*.*\d/);
    cy.url().should("not.include", "/query");

    cy.findByText("Edit query definition").click();

    cy.get(".TableInteractive").within(() => {
      cy.findByText("EAN");
      cy.findByText("TOTAL");
    });

    cy.button("Cancel").click();
    cy.url().should("match", /\/model\/[1-9]\d*.*\d/);
    cy.url().should("not.include", "/query");
  });

  it("handles failing queries", () => {
    cy.createNativeQuestion(
      {
        name: "Erroring Model",
        dataset: true,
        native: {
          // Let's use API to type the most of the query, but stil make it invalid
          query: "SELECT ",
        },
      },
      { visitQuestion: true },
    );

    openDetailsSidebar();

    cy.findByText("Customize metadata").click();
    cy.findByText(/Syntax error in SQL/);

    cy.findByText("Query").click();
    cy.findByText(/Syntax error in SQL/);

    // Using `text-input` here, which is the textarea HTML element instead of the `ace_content` (div)
    cy.get(".ace_text-input").type("1");

    runNativeQuery();

    cy.get(".cellData").contains(1);
    cy.findByText(/Syntax error in SQL/).should("not.exist");

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.get(".cellData").contains(1);
    cy.findByText(/Syntax error in SQL/).should("not.exist");
  });
});
