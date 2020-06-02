import { restore, signInAsNormalUser, modal } from "__support__/cypress";

describe("support > join filter (metabase#12228)", () => {
  before(restore);
  before(signInAsNormalUser);

  let questionId;

  it.skip("can load a question with a date filter", () => {
    cy.visit("/question/new");

    // Validate a simple SELECT query works
    cy.contains("Native query").click();
    cy.get(".ace_content").type("select count(*) from orders");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("18,760");

    // Add a date field filter
    cy.get(".ace_content:visible").type("\nwhere {{date}}", {
      parseSpecialCharSequences: false,
    });
    cy.contains("Variable type")
      .next()
      .click();
    cy.contains("Field Filter").click();
    cy.contains("Orders").click();
    cy.contains("Created At").click();

    // Use relative date
    cy.contains("Filter widget type")
      .next()
      .click();
    cy.contains("Relative Date").click();

    // Save it, don't add it to a dashboard, and get the question ID
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByLabelText("Name").type("native parameter question");
      cy.findByText("Save").click();
    });

    modal()
      .contains("Not now")
      .click();

    cy.url()
      .should("match", /\/question\/\d+$/)
      .then(url => {
        questionId = parseInt(url.match(/question\/(\d+)/)[1]);

        // Now browse directly to the question with a field parameter
        cy.visit(`/question/${questionId}?date=past30days`);
        modal()
          .contains("Okay")
          .click();
        cy.contains("514");
      });
  });
});
