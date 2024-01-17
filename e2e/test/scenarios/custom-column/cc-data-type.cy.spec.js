import {
  restore,
  openTable,
  popover,
  enterCustomColumnDetails,
  filter,
  openOrdersTable,
  visualize,
  getNotebookStep,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PEOPLE_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column > data type", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should understand string functions (metabase#13217)", () => {
    openCustomColumnInTable(PRODUCTS_ID);

    enterCustomColumnDetails({
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    cy.button("Done").click();

    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("CategoryTitle").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByPlaceholderText("Enter some text").should("be.visible");
    });
  });

  it("should understand date functions", () => {
    openOrdersTable({ mode: "notebook" });

    addCustomColumns([
      { name: "Year", formula: "year([Created At])" },
      { name: "Quarter", formula: "quarter([Created At])" },
      { name: "Month", formula: "month([Created At])" },
      { name: "Week", formula: 'week([Created At], "iso")' },
      { name: "Day", formula: "day([Created At])" },
      { name: "Weekday", formula: "weekday([Created At])" },
      { name: "Hour", formula: "hour([Created At])" },
      { name: "Minute", formula: "minute([Created At])" },
      { name: "Second", formula: "second([Created At])" },
      {
        name: "Datetime Add",
        formula: 'datetimeAdd([Created At], 1, "month")',
      },
      {
        name: "Datetime Subtract",
        formula: 'datetimeSubtract([Created At], 1, "month")',
      },
      {
        name: "ConvertTimezone 3 args",
        formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")',
      },
      {
        name: "ConvertTimezone 2 args",
        formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh")',
      },
    ]);

    visualize();
  });

  it("should relay the type of a date field", () => {
    openCustomColumnInTable(PEOPLE_ID);

    enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("DoB").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });

  it("should handle CASE (metabase#13122)", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");

      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });

  it("should handle COALESCE", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });
});

function addCustomColumns(columns) {
  cy.wrap(columns).each((column, index) => {
    if (index) {
      getNotebookStep("expression").icon("add").click();
    } else {
      cy.findByText("Custom column").click();
    }

    enterCustomColumnDetails(column);
    cy.button("Done").click();
  });
}

function openCustomColumnInTable(table) {
  openTable({ table, mode: "notebook" });
  cy.findByText("Custom column").click();
}
