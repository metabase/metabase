import { restore, popover, startNewQuestion } from "e2e/support/helpers";

describe("operators in questions", () => {
  beforeEach(() => {
    restore();
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
      expected: ["Past", "Next", "Current"],
      unexpected: ["Is null", "Not null"],
    },
    specificDates: {
      expected: ["Before", "After", "On", "Between"],
      unexpected: ["Is null", "Not null"],
    },
    excludeDates: {
      expected: [
        "Days of the week...",
        "Months of the year...",
        "Quarters of the year...",
        "Hours of the day...",
        "Is empty",
        "Is not empty",
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
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Title").click();
        cy.findByText("Is").click();
      });

      cy.findByTestId("operator-select-list").within(() => {
        expected.text.expected.map(e => cy.contains(e).should("exist"));
        expected.text.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("number operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Price").click();
        cy.findByText("Equal to").click();
      });

      cy.findByTestId("operator-select-list").within(() => {
        expected.number.expected.map(e => cy.contains(e).should("exist"));
        expected.number.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("relative date operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Relative dates...").click();
        cy.findByText("Past").click();
      });

      popover().within(() => {
        expected.relativeDates.expected.map(e =>
          cy.contains(e).should("exist"),
        );
        expected.specificDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.relativeDates.unexpected.map(e =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("specific date operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Specific dates...").click();
        cy.findByText("Between").click();
      });

      popover().within(() => {
        expected.specificDates.expected.map(e =>
          cy.contains(e).should("exist"),
        );
        expected.relativeDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.specificDates.unexpected.map(e =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("exclude date operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Exclude...").click();
      });

      popover().within(() => {
        expected.excludeDates.expected.map(e => cy.contains(e).should("exist"));
        expected.relativeDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.specificDates.expected.map(e =>
          cy.contains(e).should("not.exist"),
        );
        expected.excludeDates.unexpected.map(e =>
          cy.contains(e).should("not.exist"),
        );
      });
    });

    it("id operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Products").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("ID").click();
        cy.findByText("Is").click();
      });

      cy.findByTestId("operator-select-list").within(() => {
        expected.id.expected.map(e => cy.contains(e).should("exist"));
        expected.id.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("geo operators", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("People").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("State").click({ force: true });
        cy.findByText("Is").click();
      });

      cy.findByTestId("operator-select-list").within(() => {
        expected.geo.expected.map(e => cy.contains(e).should("exist"));
        expected.geo.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });
  });
});
