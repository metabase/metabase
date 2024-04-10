import {
  describeEE,
  filterWidget,
  openStaticEmbeddingModal,
  popover,
  restore,
  setTokenFeatures,
  visitEmbeddedPage,
  visitIframe,
  visitQuestion,
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

        openStaticEmbeddingModal({ activeTab: "appearance" });

        cy.log(
          "Embedding settings page should not show option to disable downloads",
        );
        cy.findByLabelText("Playing with appearance options")
          .should("not.contain", "Download data")
          .and("not.contain", "Enable users to download data from this embed");

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
          setFilters: { text: "Foo" },
        });

        cy.get("[data-testid=cellData]").should("have.text", "Foo");
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

        cy.get("[data-testid=cellData]").should("have.text", "Foo");
        cy.findByRole("contentinfo").icon("download");
      });
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => setTokenFeatures("all"));

    it("should be possible to disable downloads", () => {
      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);

        openStaticEmbeddingModal({
          activeTab: "appearance",
          acceptTerms: false,
        });

        cy.log("Disable downloads");
        cy.findByLabelText("Download data")
          .as("allow-download-toggle")
          .should("be.checked");

        cy.findByText("Enable users to download data from this embed").click();
        cy.get("@allow-download-toggle").should("not.be.checked");

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        visitIframe();

        filterWidget().type("Foo{enter}");
        cy.get("[data-testid=cellData]").should("have.text", "Foo");

        cy.location("search").should("eq", "?text=Foo");
        cy.location("hash").should("match", /&hide_download_button=true$/);

        cy.log("We don't even show the footer if it's empty");
        cy.findByRole("contentinfo").should("not.exist");
        cy.icon("download").should("not.exist");
      });
    });
  });
});
