import { restore, visitIframe } from "e2e/support/helpers";

describe("locked parameters in embedded question (metabase#20634)", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("publishChanges");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "20634",
        native: {
          query: "select {{text}}",
          "template-tags": {
            text: {
              id: "abc-123",
              name: "text",
              "display-name": "Text",
              type: "text",
              default: null,
            },
          },
        },
      },
      { visitQuestion: true },
    );
  });

  it("should let the user lock parameters to specific values", () => {
    cy.icon("share").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Embed in your application").click();

    cy.get(".Modal--full").within(() => {
      // select the dropdown next to the Text parameter so that we can set the value to "Locked"
      cy.findByText("Text")
        .parent()
        .within(() => {
          cy.findByText("Disabled").click();
        });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Locked").click();

    cy.get(".Modal--full").within(() => {
      // set a parameter value
      cy.findByPlaceholderText("Text").type("foo{enter}");

      // publish the embedded question so that we can directly navigate to its url
      cy.findByText("Publish").click();
      cy.wait("@publishChanges");
    });

    // directly navigate to the embedded question
    visitIframe();

    // verify that the Text parameter doesn't show up but that its value is reflected in the dashcard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Text").should("not.exist");
    cy.get(".CardVisualization").within(() => {
      cy.contains("foo");
    });
  });
});
