import { restore, signInAsNormalUser, popover } from "__support__/cypress";

describe("operators in questions", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

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
    date: {
      expected: [
        "Previous",
        "Next",
        "Current",
        "Before",
        "After",
        "On",
        "Between",
        "Is Empty",
        "Not Empty",
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
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Products").click();
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Title").click();
        cy.findByText("Is").click();
      });

      popover().within(() => {
        expected.text.expected.map(e => cy.contains(e).should("exist"));
        expected.text.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("number operators", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Products").click();
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Price").click();
        cy.findByText("Equal to").click();
      });

      popover().within(() => {
        expected.number.expected.map(e => cy.contains(e).should("exist"));
        expected.number.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("date operators", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Products").click();
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Previous").click();
      });

      popover().within(() => {
        expected.date.expected.map(e => cy.contains(e).should("exist"));
        expected.date.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("id operators", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Products").click();
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("ID").click();
        cy.findByText("Is").click();
      });

      popover().within(() => {
        expected.id.expected.map(e => cy.contains(e).should("exist"));
        expected.id.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });

    it("geo operators", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("People").click();
      cy.findByText("Add filters to narrow your answer").click();

      popover().within(() => {
        cy.findByText("State").click();
        cy.findByText("Is").click();
      });

      popover().within(() => {
        expected.geo.expected.map(e => cy.contains(e).should("exist"));
        expected.geo.unexpected.map(e => cy.contains(e).should("not.exist"));
      });
    });
  });
});
