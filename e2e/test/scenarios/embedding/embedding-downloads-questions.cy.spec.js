import {
  restore,
  describeEE,
  visitQuestion,
  visitEmbeddedPage,
  popover,
  setTokenFeatures,
  visitIframe,
  filterWidget,
} from "e2e/support/helpers";

const questionDetails = {
  name: "Simple SQL Query for Embedding",
  native: {
    query: "select {{text}} as WYSIWYG",
    "template-tags": {
      text: {
        id: "fake-uuid",
        name: "text",
        "display-name": "Text",
        type: "text",
        default: null,
      },
    },
  },
};

describeEE("scenarios > embedding > questions > downloads", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("publishChanges");
    cy.intercept("GET", "/api/embed/card/**/query").as("dl");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, {
      wrapId: true,
    });
  });

  context("without token", () => {
    it("should not be possible to disable downloads", () => {
      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);
        openEmbeddingSettingsPage();

        cy.log(
          "Embedding settings page should not show option to disable downloads",
        );
        cy.get("section")
          .should("have.length", 2)
          .and("not.contain", "Download data")
          .and("not.contain", "Enable users to download data from this embed?");

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        const payload = {
          resource: { question: questionId },
          params: {},
        };

        cy.log(
          "Visit embedded question and set its filter through query parameters",
        );
        visitEmbeddedPage(payload, {
          setFilters: "text=Foo",
        });

        cy.get(".cellData").should("have.text", "Foo");
        cy.findByRole("contentinfo").icon("download").click();

        popover().within(() => {
          cy.findByText("Download full results");
          cy.findByText(".csv");
          cy.findByText(".xlsx");
          cy.findByText(".json");
        });

        cy.log(
          "Trying to prevent downloads via query params doesn't have any effect",
        );
        cy.url().then(url => {
          cy.visit(url + "&hide_download_button=true");
        });

        cy.get(".cellData").should("have.text", "Foo");
        cy.findByRole("contentinfo").icon("download");
      });
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => setTokenFeatures("all"));

    it("should be possible to disable downloads", () => {
      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);
        openEmbeddingSettingsPage();

        cy.log("Disable downloads");
        cy.findByLabelText("Enable users to download data from this embed?")
          .should("be.checked")
          .click()
          .should("not.be.checked");

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        visitIframe();

        filterWidget().type("Foo{enter}");
        cy.get(".cellData").should("have.text", "Foo");

        cy.location("search").should("eq", "?text=Foo");
        cy.location("hash").should("match", /&hide_download_button=true$/);

        cy.log("We don't even show the footer if it's empty");
        cy.findByRole("contentinfo").should("not.exist");
        cy.icon("download").should("not.exist");
      });
    });
  });
});

function openEmbeddingSettingsPage() {
  cy.intercept("GET", "/api/session/properties").as("sessionProperties");

  cy.icon("share").click();
  cy.findByText("Embed in your application").click();
  cy.wait("@sessionProperties");
}
