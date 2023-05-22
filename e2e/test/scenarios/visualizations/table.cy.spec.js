import {
  restore,
  openPeopleTable,
  openOrdersTable,
  openNativeEditor,
  popover,
  enterCustomColumnDetails,
  visualize,
  summarize,
} from "e2e/support/helpers";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    openPeopleTable({ limit: 2 });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("City").click();

    popover().within(() => {
      cy.icon("gear").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Link").click();

    cy.findByTestId("link_text").type("{{C");
    cy.findByTestId("select-list").within(() => {
      cy.findAllByText("CITY").click();
    });

    cy.findByTestId("link_text")
      .type(" {{ID}} fixed text", {
        parseSpecialCharSequences: false,
      })
      .blur();

    cy.findByTestId("link_url")
      .type("http://metabase.com/people/{{ID}}", {
        parseSpecialCharSequences: false,
      })
      .blur();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Wood River 1 fixed text").should(
      "have.attr",
      "href",
      "http://metabase.com/people/1",
    );
  });

  it("should show field metadata in a popover when hovering over a table column header", () => {
    const ccName = "Foo";

    openPeopleTable({ mode: "notebook", limit: 2 });

    cy.icon("add_data").click();

    popover().within(() => {
      enterCustomColumnDetails({
        formula: "concat([Name], [Name])",
        name: ccName,
      });

      cy.button("Done").click();
    });

    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("City").click();
      cy.findByText("State").click();
      cy.findByText("Birth Date").click();
      cy.findByText("Latitude").click();
    });

    // Click anywhere else to close the popover which is blocking the Visualize button
    cy.get(".QueryBuilder").click(0, 0);

    visualize();

    [
      [
        "ID",
        () => {
          // semantic type
          cy.contains("Entity Key");
          // description
          cy.contains("A unique identifier given to each user.");
        },
      ],
      [
        "City",
        () => {
          // semantic type
          cy.contains("City");
          // description
          cy.contains("The city of the account’s billing address");
          // fingerprint
          cy.findByText("1,966 distinct values");
        },
      ],
      [
        "State",
        () => {
          // semantic type
          cy.contains("State");
          // fingerprint
          cy.findByText("49 distinct values");
          cy.contains("AK, AL, AR");
        },
      ],
      [
        "Birth Date",
        () => {
          // semantic type
          cy.contains("No special type");
          // fingerprint
          cy.findByText("America/Los_Angeles");
          cy.findByText("April 26, 1958, 12:00 AM");
          cy.findByText("April 3, 2000, 12:00 AM");
        },
      ],
      [
        "Latitude",
        () => {
          // semantic type
          cy.contains("Latitude");
          // fingerprint
          cy.contains("39.88");
          cy.findByText("25.78");
          cy.findByText("70.64");
        },
      ],
      [
        ccName,
        () => {
          // semantic type
          cy.contains("No special type");
          // description
          cy.findByText("No description");
        },
      ],
    ].forEach(([column, test]) => {
      cy.get(".cellData").contains(column).trigger("mouseenter");

      popover().within(() => {
        test();
      });

      cy.get(".cellData").contains(column).trigger("mouseleave");
    });

    summarize();

    cy.findAllByTestId("dimension-list-item-name").contains(ccName).click();

    cy.wait("@dataset");

    cy.get(".Visualization").within(() => {
      // Make sure new table results loaded with Custom column and Count columns
      cy.contains(ccName);
      cy.contains("Count").trigger("mouseenter");
    });

    popover().within(() => {
      cy.contains("No special type");
      cy.findByText("No description");
    });
  });

  it("should show the field metadata popover for a foreign key field (metabase#19577)", () => {
    openOrdersTable({ limit: 2 });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").trigger("mouseenter");

    popover().within(() => {
      cy.contains("Foreign Key");
      cy.contains("The product ID.");
    });
  });

  it("should show field metadata popovers for native query tables", () => {
    openNativeEditor().type("select * from products");
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get(".cellData").contains("CATEGORY").trigger("mouseenter");
    popover().within(() => {
      cy.contains("No special type");
      cy.findByText("No description");
    });
  });

  it.skip("should close the colum popover on subsequent click (metabase#16789)", () => {
    openPeopleTable({ limit: 2 });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("City").click();
    popover().within(() => {
      cy.icon("arrow_up");
      cy.icon("arrow_down");
      cy.icon("gear");
      cy.findByText("Filter by this column");
      cy.findByText("Distribution");
      cy.findByText("Distinct values");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("City").click();
    // Although arbitrary waiting is considered an anti-pattern and a really bad practice, I couldn't find any other way to reproduce this issue.
    // Cypress is too fast and is doing the assertions in that split second while popover is reloading which results in a false positive result.
    cy.wait(100);
    popover().should("not.exist");
  });
});
