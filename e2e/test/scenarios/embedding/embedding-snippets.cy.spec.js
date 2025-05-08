const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { IFRAME_CODE, getEmbeddingJsCode } from "./shared/embedding-snippets";

const features = ["none", "all"];

function codeBlock() {
  return cy.get(".cm-content");
}

function highlightedTexts() {
  return cy.findAllByTestId("highlighted-text");
}

features.forEach((feature) => {
  describe(`[tokenFeatures=${feature}] scenarios > embedding > code snippets`, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures(feature);
    });

    it("dashboard should have the correct embed snippet", () => {
      const defaultDownloadsValue = feature === "all" ? true : undefined;
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openStaticEmbeddingModal({ acceptTerms: false });

      H.modal().within(() => {
        cy.findByText(
          "To embed this dashboard in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        );

        cy.findByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        );

        codeBlock()
          .first()
          .invoke("text")
          .should(
            "match",
            getEmbeddingJsCode({
              type: "dashboard",
              id: ORDERS_DASHBOARD_ID,
              downloads: defaultDownloadsValue,
            }),
          );

        cy.findAllByTestId("embed-backend-select-button")
          .should("contain", "Node.js")
          .click();
      });

      H.popover()
        .should("contain", "Node.js")
        .and("contain", "Ruby")
        .and("contain", "Python")
        .and("contain", "Clojure");

      // eslint-disable-next-line no-unsafe-element-filtering
      codeBlock().last().should("have.text", IFRAME_CODE);

      H.modal()
        .findAllByTestId("embed-frontend-select-button")
        .should("contain", "Pug / Jade")
        .click();

      H.popover()
        .should("contain", "Mustache")
        .and("contain", "Pug / Jade")
        .and("contain", "ERB")
        .and("contain", "JSX");

      H.modal().within(() => {
        cy.findByRole("tab", { name: "Look and Feel" }).click();

        // set transparent background metabase#23477
        cy.findByText("Dashboard background").click();
        codeBlock()
          .first()
          .invoke("text")
          .should(
            "match",
            getEmbeddingJsCode({
              type: "dashboard",
              id: ORDERS_DASHBOARD_ID,
              background: false,
              downloads: defaultDownloadsValue,
            }),
          );

        if (feature === "all") {
          // Disable both download options
          cy.findByText("Export to PDF").click();
          cy.findByText("Results (csv, xlsx, json, png)").click();

          codeBlock()
            .first()
            .invoke("text")
            .should(
              "match",
              getEmbeddingJsCode({
                type: "dashboard",
                id: ORDERS_DASHBOARD_ID,
                background: false,
                downloads: false,
              }),
            );

          // Verify that switching tabs keeps the highlighted texts
          highlightedTexts().should("have.length", 1);

          cy.findByRole("tab", { name: "Parameters" }).click();
          cy.findByRole("tab", { name: "Look and Feel" }).click();

          highlightedTexts().should("have.length", 1);
        }
      });
    });

    it("question should have the correct embed snippet", () => {
      const defaultDownloadsValue = feature === "all" ? true : undefined;
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openStaticEmbeddingModal({ acceptTerms: false });

      H.modal().within(() => {
        cy.findByText(
          "To embed this question in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        );
        cy.findByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        );

        codeBlock()
          .first()
          .invoke("text")
          .should(
            "match",
            getEmbeddingJsCode({
              type: "question",
              id: ORDERS_QUESTION_ID,
              downloads: defaultDownloadsValue,
            }),
          );

        cy.findByRole("tab", { name: "Look and Feel" }).click();

        // hide download button for pro/enterprise users metabase#23477
        if (feature === "all") {
          cy.findByText("Download (csv, xlsx, json, png)").click();

          codeBlock()
            .first()
            .invoke("text")
            .should(
              "match",
              getEmbeddingJsCode({
                type: "question",
                id: ORDERS_QUESTION_ID,
                downloads: false,
              }),
            );
        }

        cy.findByTestId("embed-backend-select-button")
          .should("contain", "Node.js")
          .click();
      });

      H.popover()
        .should("contain", "Node.js")
        .and("contain", "Ruby")
        .and("contain", "Python")
        .and("contain", "Clojure");

      if (feature === "all") {
        // Verify that switching tabs keeps the highlighted texts
        highlightedTexts().should("have.length", 1);

        cy.findByRole("tab", { name: "Parameters" }).click();
        cy.findByRole("tab", { name: "Look and Feel" }).click();

        highlightedTexts().should("have.length", 1);
      }
    });
  });
});
