import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { visitNewEmbedPage } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > common (oss and starter)", () => {
  describe("OSS", { tags: "@OSS" }, () => runTests({ token: null }));

  describe("Starter", () => runTests({ token: "starter" }));

  function runTests({ token }: { token: "starter" | null }) {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      if (token) {
        H.activateToken(token);
      }

      H.enableTracking();

      cy.intercept("GET", "/api/dashboard/**").as("dashboard");

      H.mockEmbedJsToDevServer();
    });

    it("allows to select the `guest` item even when static embedding setting is disabled", () => {
      H.updateSetting("enable-embedding-static", false);

      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      visitNewEmbedPage({ waitForResource: false });

      cy.findByLabelText("Guest").should("be.enabled");
    });

    it("does not allow to select the `Metabase Account`, when token feature is missing (oss)", () => {
      H.updateSetting("enable-embedding-simple", false);

      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      visitNewEmbedPage({ waitForResource: false });

      cy.findByLabelText("Metabase account (SSO)").should("be.disabled");
    });
  }
});
