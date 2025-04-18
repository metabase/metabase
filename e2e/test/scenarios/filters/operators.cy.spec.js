const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("operators in questions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  const expected = {
    text: {
      expected: [
        "Is",
        "Is not",
        "Contains",
        "Does not contain",
        "Is empty",
        "Not empty",
        "Starts with",
        "Ends with",
      ],
      unexpected: ["Is null", "Not null"],
    },
    number: {
      expected: [
        "Equal to",
        "Not equal to",
        "Greater than",
        "Less than",
        "Between",
        "Greater than or equal to",
        "Less than or equal to",
        "Is empty",
        "Not empty",
      ],
      unexpected: ["Is null", "Not null"],
    },
    relativeDates: {
      expected: ["Previous", "Next", "Current"],
      unexpected: ["Is null", "Not null"],
    },
    specificDates: {
      expected: ["Before", "After", "On", "Between"],
      unexpected: ["Is null", "Not null"],
    },
    excludeDates: {
      expected: [
        "Days of the week…",
        "Months of the year…",
        "Quarters of the year…",
        "Hours of the day…",
        "Empty values",
        "Not empty values",
      ],
      unexpected: ["Is null", "Not null"],
    },
    id: {
      expected: ["Is", "Is not", "Is empty", "Not empty"],
      unexpected: ["Is null", "Not null"],
    },
    geo: {
      expected: ["Is", "Is not"],
      unexpected: ["Is null", "Not null"],
    },
  };

  describe("fields have proper operators", () => {
    it("text operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("Title").click();
        cy.findByText("Is").click();
      });

      cy.findByRole("menu").within(() => {
        expected.text.expected.map((e) => cy.contains(e).should("exist"));
        expected.text.unexpected.map((e) => cy.contains(e).should("not.exist"));
      });
    });

    it("number operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("Price").click();
        cy.findByText("Between").click();
      });

      cy.findByRole("menu").within(() => {
        expected.number.expected.map((e) => cy.contains(e).should("exist"));
        expected.number.unexpected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("relative date operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
      });

      H.clauseStepPopover().within(() => {
        expected.relativeDates.expected.map((e) =>
          cy.contains(e).should("exist"),
        );
        expected.specificDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.relativeDates.unexpected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("specific date operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Fixed date range…").click();
        cy.findByText("Between").click();
      });

      H.popover().within(() => {
        expected.specificDates.expected.map((e) =>
          cy.contains(e).should("exist"),
        );
        expected.relativeDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.specificDates.unexpected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("exclude date operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Exclude…").click();
      });

      H.popover().within(() => {
        expected.excludeDates.expected.map((e) =>
          cy.contains(e).should("exist"),
        );
        expected.relativeDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.specificDates.expected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.unexpected.map((e) =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("id operators", () => {
      setup(PRODUCTS_ID);

      H.popover().within(() => {
        cy.findByText("ID").click();
        cy.findByText("Is").click();
      });

      cy.findByRole("menu").within(() => {
        expected.id.expected.map((e) => cy.contains(e).should("exist"));
        expected.id.unexpected.map((e) => cy.contains(e).should("not.exist"));
      });
    });

    it("geo operators", () => {
      setup(PEOPLE_ID);

      H.popover().within(() => {
        cy.findByText("State").click({ force: true });
        cy.findByText("Is").click();
      });

      cy.findByRole("menu").within(() => {
        expected.geo.expected.map((e) => cy.contains(e).should("exist"));
        expected.geo.unexpected.map((e) => cy.contains(e).should("not.exist"));
      });
    });
  });
});

function setup(tableId) {
  H.openTable({ table: tableId, mode: "notebook" });
  cy.findByRole("button", { name: "Filter" }).click();
}
