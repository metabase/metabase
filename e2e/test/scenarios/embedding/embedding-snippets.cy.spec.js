import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  visitDashboard,
  visitQuestion,
  setTokenFeatures,
  openStaticEmbeddingModal,
  modal,
} from "e2e/support/helpers";

import { getEmbeddingJsCode, IFRAME_CODE } from "./shared/embedding-snippets";

const features = ["none", "all"];

features.forEach(feature => {
  describe(`[tokenFeatures=${feature}] scenarios > embedding > code snippets`, () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures(feature);
    });

    it("dashboard should have the correct embed snippet", () => {
      const defaultDownloadsValue = feature === "all" ? true : undefined;
      visitDashboard(ORDERS_DASHBOARD_ID);
      openStaticEmbeddingModal({ acceptTerms: false });

      modal().within(() => {
        cy.findByText(
          "To embed this dashboard in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        );

        cy.findByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        );

        cy.get(".ace_content")
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

      popover()
        .should("contain", "Node.js")
        .and("contain", "Ruby")
        .and("contain", "Python")
        .and("contain", "Clojure");

      cy.get(".ace_content").last().should("have.text", IFRAME_CODE);

      modal()
        .findAllByTestId("embed-frontend-select-button")
        .should("contain", "Pug / Jade")
        .click();

      popover()
        .should("contain", "Mustache")
        .and("contain", "Pug / Jade")
        .and("contain", "ERB")
        .and("contain", "JSX");

      modal().within(() => {
        cy.findByRole("tab", { name: "Look and Feel" }).click();

        // set transparent background metabase#23477
        cy.findByText("Dashboard background").click();
        cy.get(".ace_content")
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
          cy.findByText("Download buttons").click();

          cy.get(".ace_content")
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
        }
      });
    });

    it("question should have the correct embed snippet", () => {
      const defaultDownloadsValue = feature === "all" ? true : undefined;
      visitQuestion(ORDERS_QUESTION_ID);
      openStaticEmbeddingModal({ acceptTerms: false });

      modal().within(() => {
        cy.findByText(
          "To embed this question in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        );
        cy.findByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        );

        cy.get(".ace_content")
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
          cy.findByText("Download buttons").click();

          cy.get(".ace_content")
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

      popover()
        .should("contain", "Node.js")
        .and("contain", "Ruby")
        .and("contain", "Python")
        .and("contain", "Clojure");
    });
  });
});
