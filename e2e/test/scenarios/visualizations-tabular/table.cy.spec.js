import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  enterCustomColumnDetails,
  isScrollableHorizontally,
  openNativeEditor,
  openOrdersTable,
  openPeopleTable,
  popover,
  hovercard,
  restore,
  summarize,
  visualize,
  resetTestTable,
  resyncDatabase,
  visitQuestionAdhoc,
  getTable,
  leftSidebar,
} from "e2e/support/helpers";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/field/*/search/*").as("findSuggestions");
  });

  function joinTable(table) {
    cy.findByText("Join data").click();
    popover().findByText(table).click();
  }

  function selectFromDropdown(option, clickOpts) {
    popover().last().findByText(option).click(clickOpts);
  }

  it("should allow changing column title when the field ref is the same except for the join-alias", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });
    joinTable("Orders");
    selectFromDropdown("ID");
    selectFromDropdown("User ID");
    visualize();

    // Rename the first ID column, and make sure the second one is not updated
    headerCells().findByText("ID").click();
    popover().within(() => {
      cy.findByText("Filter by this column");
      cy.icon("gear").click();
      cy.findByLabelText("Column title").type(" updated");
      // This defocuses the input, which triggers the update
      cy.findByText("Column title").click();
    });
    // click somewhere else to close the popover
    headerCells().last().click();
    headerCells().findAllByText("ID updated").should("have.length", 1);
  });

  it("should allow you to reorder and hide columns in the table header", () => {
    openNativeEditor().type("select * from orders LIMIT 2");
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.findByTestId("viz-settings-button").click();

    cy.findByTestId(/subtotal-hide-button/i).click();
    cy.findByTestId(/tax-hide-button/i).click();
    cy.findByTestId("sidebar-left").findByText("Done").click();

    headerCells().eq(3).should("contain.text", "TOTAL").as("total");

    cy.get("@total")
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", -220, 0, { force: true })
      .trigger("mouseup", -220, 0, { force: true });

    headerCells().eq(1).should("contain.text", "TOTAL");

    headerCells().contains("QUANTITY").click();
    popover().icon("eye_crossed_out").click();

    headerCells().contains("QUANTITY").should("not.exist");
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

    cy.findByLabelText("Link text").type("{{C");
    cy.findByTestId("select-list").within(() => {
      cy.findAllByText("CITY").click();
    });

    cy.findByLabelText("Link text")
      .type(" {{ID}} fixed text", {
        parseSpecialCharSequences: false,
      })
      .blur();

    cy.findByLabelText("Link URL")
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

  it("should show field metadata in a hovercard when hovering over a table column header", () => {
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
          cy.findByText("Timezone");
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
      cy.get(".cellData").contains(column).realHover();

      // Add a delay here because there can be two popovers active for a very short time.
      cy.wait(100);

      popover().within(() => {
        test();
      });

      cy.get(".cellData").contains(column).trigger("mouseleave");
    });

    summarize();

    cy.findAllByTestId("dimension-list-item-name").contains(ccName).click();

    cy.wait("@dataset");

    cy.get(".cellData").contains("Count").realHover();
    hovercard().within(() => {
      cy.contains("Quantity");
      cy.findByText("No description");
    });

    // Make sure new table results loaded with Custom column and Count columns
    cy.get(".cellData").contains(ccName).realHover();
    cy.wait(100);

    popover().within(() => {
      cy.contains("No special type");
      cy.findByText("No description");
    });
  });

  it("should show the field metadata popover for a foreign key field (metabase#19577)", () => {
    openOrdersTable({ limit: 2 });

    cy.get(".cellData").contains("Product ID").realHover();

    hovercard().within(() => {
      cy.contains("Foreign Key");
      cy.contains("The product ID.");
    });
  });

  it("should show field metadata hovercards for native query tables", () => {
    openNativeEditor().type("select * from products");
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.get(".cellData").contains("CATEGORY").realHover();

    hovercard().within(() => {
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

  it("popover should not be scrollable horizontally (metabase#31339)", () => {
    openPeopleTable();
    headerCells().filter(":contains('Password')").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Password").type("e").blur();
      cy.wait("@findSuggestions");
    });

    popover().then($popover => {
      expect(isScrollableHorizontally($popover[0])).to.be.false;
    });
  });
});

describe("scenarios > visualizations > table > conditional formatting", () => {
  beforeEach(() => {
    resetTestTable({ type: "postgres", table: "many_data_types" });
    restore("postgres-writable");
    cy.signInAsAdmin();
    resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: "many_data_types",
    });

    getTable({ name: "many_data_types" }).then(({ id: tableId, fields }) => {
      const booleanField = fields.find(field => field.name === "boolean");
      const stringField = fields.find(field => field.name === "string");
      const idField = fields.find(field => field.name === "id");

      visitQuestionAdhoc({
        dataset_query: {
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            fields: [
              ["field", idField.id, { "base-type": idField["base_type"] }],
              [
                "field",
                stringField.id,
                { "base-type": stringField["base_type"] },
              ],
              [
                "field",
                booleanField.id,
                { "base-type": booleanField["base_type"] },
              ],
            ],
          },
          type: "query",
        },
        display: "table",
      });
    });
  });

  it("should work with boolean columns", { tags: ["@external"] }, () => {
    cy.findByTestId("viz-settings-button").click();
    leftSidebar().findByText("Conditional Formatting").click();
    cy.findByRole("button", { name: /add a rule/i }).click();

    popover().findByRole("option", { name: "Boolean" }).click();

    //Dismiss popover
    leftSidebar().findByText("Which columns should be affected?").click();

    //Check that is-true was applied by default to boolean field rule
    cy.findByTestId("conditional-formatting-value-operator-button").should(
      "contain.text",
      "is true",
    );

    cy.findByRole("gridcell", { name: "true" }).should(
      "have.css",
      "background-color",
      "rgba(80, 158, 227, 0.65)",
    );
  });
});

describe("scenarios > visualizations > table > time formatting (#11398)", () => {
  const singleTimeQuery = `
      WITH t1 AS (SELECT TIMESTAMP '2023-01-01 18:34:00' AS time_value),
           t2 AS (SELECT CAST(time_value AS TIME) AS creation_time
                  FROM t1)
      SELECT *
      FROM t2;
  `;

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should work with time columns", { tags: ["@external"] }, () => {
    cy.createNativeQuestion(
      {
        name: "11398",
        native: {
          query: singleTimeQuery,
        },
      },
      { visitQuestion: true },
    );

    // Open the formatting menu
    cy.findByTestId("field-info-popover").click();

    popover().icon("gear").click();

    cy.findByTestId("column-formatting-settings").within(() => {
      // Set to hours, minutes, seconds, 24-hour clock
      cy.findByText("HH:MM:SS").click();
      cy.findByText("17:24 (24-hour clock)").click();
    });

    // And you should find the result
    cy.findByRole("gridcell").findByText("18:34:00");

    cy.findByTestId("column-formatting-settings").within(() => {
      // Add millisecond display and change back to 12 hours
      cy.findByText("HH:MM:SS.MS").click();
      cy.findByText("5:24 PM (12-hour clock)").click();
    });

    // And you should find the result
    cy.findByRole("gridcell").findByText("6:34:00.000 PM");
  });
});

function headerCells() {
  return cy.findAllByTestId("header-cell");
}
