import {
  restore,
  openPeopleTable,
  openOrdersTable,
  openNativeEditor,
  popover,
  enterCustomColumnDetails,
  visualize,
} from "__support__/e2e/cypress";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    openPeopleTable();
    cy.wait("@dataset");

    cy.findByText("City").click();

    popover().within(() => {
      cy.icon("gear").click();
    });

    cy.findByText("Link").click();

    // There is a lag caused by update of the table visualization which breaks Cypress typing.
    // Any field in the table will not be "actionable" (the whole table has an overlay with pointer-events set to none) so Cypress cannot click it.
    // Adding this line makes sure the table finished updating, and solves the typing issue.
    cy.findByText("Address").click();

    cy.findByTestId("link_text").type("{{CITY}} {{ID}} fixed text", {
      parseSpecialCharSequences: false,
    });

    cy.findByTestId("link_url").type("http://metabase.com/people/{{ID}}", {
      parseSpecialCharSequences: false,
    });

    cy.findByText("Done").click();

    cy.findByText("Wood River 1 fixed text").should(
      "have.attr",
      "href",
      "http://metabase.com/people/1",
    );
  });

  it("should show field metadata in a popover when hovering over a table column header", () => {
    openPeopleTable();
    cy.wait("@dataset");

    cy.icon("notebook").click();
    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("City").click();
      cy.findByText("State").click();
      cy.findByText("Birth Date").click();
      cy.findByText("Latitude").click();
    });

    cy.findByText("Custom column").click();

    popover().within(() => {
      enterCustomColumnDetails({
        formula: "concat([Name], [Name])",
        name: "CustomColumn",
      });

      cy.findByText("Done").click();
    });

    visualize();

    [
      [
        "ID",
        () => {
          cy.contains("A unique identifier given to each user.");
        },
      ],
      [
        "City",
        () => {
          cy.contains("The city of the account’s billing address");
          cy.findByText("1,966 distinct values");
        },
      ],
      [
        "State",
        () => {
          cy.findByText("49 distinct values");
          cy.contains("AK, AL, AR");
        },
      ],
      [
        "Birth Date",
        () => {
          cy.findByText("America/Los_Angeles");
          cy.findByText("April 26, 1958, 12:00 AM");
          cy.findByText("April 3, 2000, 12:00 AM");
        },
      ],
      [
        "Latitude",
        () => {
          cy.contains("39.88");
          cy.findByText("25.78");
          cy.findByText("70.64");
        },
      ],
      [
        "CustomColumn",
        () => {
          cy.findByText("No description");
        },
      ],
    ].forEach(([column, test]) => {
      cy.get(".cellData")
        .contains(column)
        .trigger("mouseenter");

      popover().within(() => {
        cy.contains(column);
        test();
      });

      cy.get(".cellData")
        .contains(column)
        .trigger("mouseleave");
    });

    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.findAllByTestId("dimension-list-item-name")
      .first()
      .click();

    cy.icon("table2").click();

    cy.get(".cellData")
      .contains("Count")
      .trigger("mouseenter");

    popover().within(() => {
      cy.contains("Count");
      cy.findByText("No description");
    });
  });

  it("should show the field metadata popover for a foreign key field (metabase#19577)", () => {
    openOrdersTable();
    cy.wait("@dataset");

    cy.findByText("Product ID").trigger("mouseenter");

    popover().within(() => {
      cy.contains("Product ID");
      cy.contains("The product ID.");
    });
  });

  it("should show field metadata popovers for native query tables", () => {
    openNativeEditor().type("select * from products");
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get(".cellData")
      .contains("CATEGORY")
      .trigger("mouseenter");
    popover().within(() => {
      cy.contains("CATEGORY");
      cy.findByText("No description");
    });
  });

  it.skip("should close the colum popover on subsequent click (metabase#16789)", () => {
    openPeopleTable();
    cy.wait("@dataset");

    cy.findByText("City").click();
    popover().within(() => {
      cy.icon("arrow_up");
      cy.icon("arrow_down");
      cy.icon("gear");
      cy.findByText("Filter by this column");
      cy.findByText("Distribution");
      cy.findByText("Distincts");
    });

    cy.findByText("City").click();
    // Although arbitrary waiting is considered an anti-pattern and a really bad practice, I couldn't find any other way to reproduce this issue.
    // Cypress is too fast and is doing the assertions in that split second while popover is reloading which results in a false positive result.
    cy.wait(100);
    popover().should("not.exist");
  });
});
