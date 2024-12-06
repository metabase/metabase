import { H } from "e2e/support";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

H.describeEE("scenarios > premium > content verification", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  context("without a token", () => {
    beforeEach(() => H.setTokenFeatures("none"));

    it("should not be able to verify a saved question", () => {
      cy.log("Gate the API");
      cy.request({
        method: "POST",
        url: "/api/moderation-review",
        failOnStatusCode: false,
        body: {
          status: "verified",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
          moderated_item_type: "card",
        },
      }).then(({ body, status, statusText }) => {
        expect(body).to.deep.include(
          H.getPartialPremiumFeatureError("Content verification"),
        );
        expect(status).to.eq(402);
        expect(statusText).to.eq("Payment Required");
      });

      cy.log("Gate the UI");
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openQuestionActions();
      H.popover()
        .should("contain", "Add to dashboard")
        .and("not.contain", "Verify this question");

      cy.log("Turn the question into a model and try again");
      cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        type: "model",
      });

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.visit(`/model/${ORDERS_COUNT_QUESTION_ID}`);
      cy.wait("@dataset");

      H.openQuestionActions();
      H.popover()
        .should("contain", "Edit query definition")
        .and("not.contain", "Verify this question");
    });

    it("should not be able to verify a Dashboard", () => {
      cy.log("Gate the API");
      cy.request({
        method: "POST",
        url: "/api/moderation-review",
        failOnStatusCode: false,
        body: {
          status: "verified",
          moderated_item_id: ORDERS_DASHBOARD_ID,
          moderated_item_type: "dashboard",
        },
      }).then(({ body, status, statusText }) => {
        expect(body).to.deep.include(
          H.getPartialPremiumFeatureError("Content verification"),
        );
        expect(status).to.eq(402);
        expect(statusText).to.eq("Payment Required");
      });

      cy.log("Gate the UI");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openDashboardMenu();
      H.popover()
        .should("contain", "Enter fullscreen")
        .and("not.contain", "Verify this question");
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => H.setTokenFeatures("all"));

    describe("an admin", () => {
      it("should be able to verify and unverify a saved question", () => {
        H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

        verifyQuestion();

        // 1. Question title
        cy.findByTestId("qb-header").within(() => {
          cy.findByText("Orders, Count");
          cy.icon("verified");
        });

        // 2. Question's history
        H.questionInfoButton().click();
        H.sidesheet().within(() => {
          cy.findByText(/You verified this/);
          cy.findByRole("tab", { name: "History" }).click();
          cy.findByText("You verified this");
        });
        cy.findByLabelText("Close").click();

        // 3. Recently viewed list
        H.openCommandPalette();
        H.commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled");
        H.commandPaletteInput().type("Orders");
        H.commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled");
        H.closeCommandPalette();

        // 4. Search results
        H.commandPaletteSearch("orders");
        cy.findAllByTestId("search-result-item")
          .contains("Orders, Count")
          .siblings(".Icon-verified_filled");

        // 5. Question's collection
        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders, Count")
          .closest("td")
          .icon("verified");

        cy.log("Go back to the question and remove the verification");
        H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

        removeQuestionVerification();

        // 1. Question title
        cy.findByTestId("qb-header-left-side")
          .find(".Icon-verified")
          .should("not.exist");

        // 2. Question's history
        H.questionInfoButton().click();
        H.sidesheet().within(() => {
          cy.findByRole("tab", { name: "History" }).click();
          cy.findByText("You removed verification");
          cy.findByText("You verified this"); // Implicit assertion - there can be only one :)
        });
        cy.findByLabelText("Close").click();

        // 3. Recently viewed list
        H.openCommandPalette();
        H.commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled")
          .should("not.exist");
        H.commandPaletteInput().type("Orders");
        H.commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled")
          .should("not.exist");
        H.closeCommandPalette();

        // 4. Search results
        H.commandPaletteSearch("orders");
        cy.findAllByTestId("search-result-item")
          .contains("Orders, Count")
          .siblings(".Icon-verified_filed")
          .should("not.exist");

        // 5. Question's collection
        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders, Count")
          .closest("td")
          .icon("verified")
          .should("not.exist");
      });

      it("should be able to verify and unverify a dashboard", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        verifyDashboard();

        // 1. Question title
        cy.findByTestId("dashboard-header").within(() => {
          cy.findByText("Orders in a dashboard");
          cy.icon("verified");
        });

        // 2. Question's history
        H.openDashboardInfoSidebar();
        H.sidesheet().within(() => {
          cy.findByText(/You verified this/);
          cy.findByRole("tab", { name: "History" }).click();
          cy.findByText("You verified this");
        });
        cy.findByLabelText("Close").click();

        // // 3. Recently viewed list
        H.openCommandPalette();
        H.commandPalette()
          .findByRole("option", { name: "Orders in a dashboard" })
          .find(".Icon-verified_filled");
        H.closeCommandPalette();

        // // 4. Search results
        H.commandPaletteSearch("orders");
        cy.findAllByTestId("search-result-item")
          .contains("Orders in a dashboard")
          .siblings(".Icon-verified_filled");

        // // 5. Question's collection
        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders in a dashboard")
          .closest("td")
          .icon("verified");

        cy.log("Go back to the question and remove the verification");
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        removeDashboardVerification();

        // 1. Question title
        cy.findByTestId("dashboard-header")
          .find(".Icon-verified")
          .should("not.exist");

        // 2. Question's history
        H.openDashboardInfoSidebar().click();
        H.sidesheet().within(() => {
          cy.findByRole("tab", { name: "History" }).click();
          cy.findByText("You removed verification");
          cy.findByText("You verified this"); // Implicit assertion - there can be only one :)
        });
        cy.findByLabelText("Close").click();

        // 3. Recently viewed list
        H.openCommandPalette();
        H.commandPalette()
          .findByRole("option", { name: "Orders in a dashboard" })
          .find(".Icon-verified_filled")
          .should("not.exist");
        H.closeCommandPalette();

        // 4. Search results
        H.commandPaletteSearch("orders");
        cy.findAllByTestId("search-result-item")
          .contains("Orders in a dashboard")
          .siblings(".Icon-verified_filed")
          .should("not.exist");

        // 5. Question's collection
        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders in a dashboard")
          .closest("td")
          .icon("verified")
          .should("not.exist");
      });
    });

    describe("non-admin user", () => {
      beforeEach(() => {
        H.createModerationReview({
          status: "verified",
          moderated_item_type: "card",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
        });

        H.createModerationReview({
          status: "verified",
          moderated_item_type: "dashboard",
          moderated_item_id: ORDERS_DASHBOARD_ID,
        });

        cy.signInAsNormalUser();
      });

      it("should be able to see that a question has been verified but can't moderate the question themselves", () => {
        H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

        cy.findByTestId("qb-header").within(() => {
          cy.findByText("Orders, Count");
          cy.icon("verified");
        });

        cy.log("Non-admin users cannot change question verification status.");
        H.openQuestionActions();
        H.popover()
          .should("contain", "Add to dashboard")
          .and("not.contain", "Remove verification");

        H.questionInfoButton().click();
        H.sidesheet().within(() => {
          cy.findAllByText(/A moderator verified this/); // overview tab
          cy.findByRole("tab", { name: "History" }).click();
          cy.findAllByText("A moderator verified this"); // history tab
        });
        cy.findByLabelText("Close").click();

        H.commandPaletteSearch("orders");
        cy.log("Verified content should show up higher in search results");
        cy.findAllByTestId("search-result-item")
          .eq(1)
          .within(() => {
            cy.findByText("Orders, Count");
            cy.icon("verified_filled");
          });

        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders, Count")
          .closest("td")
          .icon("verified");
      });

      it("should be able to see that a dashboard has been verified but can't moderate the dashboard themselves", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        cy.findByTestId("dashboard-header").within(() => {
          cy.findByText("Orders in a dashboard");
          cy.icon("verified");
        });

        cy.log("Non-admin users cannot change question verification status.");
        H.openDashboardMenu();
        H.popover()
          .should("contain", "Enter fullscreen")
          .and("not.contain", "Remove verification");

        H.openDashboardInfoSidebar();
        H.sidesheet().within(() => {
          cy.findAllByText(/A moderator verified this/); // overview tab
          cy.findByRole("tab", { name: "History" }).click();
          cy.findAllByText("A moderator verified this"); // history tab
        });
        cy.findByLabelText("Close").click();

        H.commandPaletteSearch("orders");
        cy.log("Verified content should show up higher in search results");
        cy.findAllByTestId("search-result-item")
          .first()
          .within(() => {
            cy.findByText("Orders in a dashboard");
            cy.icon("verified_filled");
          });

        cy.visit("/collection/root");
        cy.findByRole("table")
          .findByText("Orders in a dashboard")
          .closest("td")
          .icon("verified");
      });
    });
  });

  context("token expired or removed", () => {
    beforeEach(() => {
      H.setTokenFeatures("all");
      H.createModerationReview({
        status: "verified",
        moderated_item_type: "card",
        moderated_item_id: ORDERS_COUNT_QUESTION_ID,
      });

      H.createModerationReview({
        status: "verified",
        moderated_item_type: "dashboard",
        moderated_item_id: ORDERS_DASHBOARD_ID,
      });

      H.setTokenFeatures("none");
    });

    it("should not treat the question as verified anymore", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      cy.findByTestId("qb-header").within(() => {
        cy.findByText("Orders, Count");
        cy.icon("verified").should("not.exist");
      });

      H.questionInfoButton().click();
      H.sidesheet().within(() => {
        cy.findByRole("tab", { name: "History" }).click();
        cy.contains(/created this./);
        cy.contains(/verified this/).should("not.exist");
      });
      cy.findByLabelText("Close").click();

      H.openCommandPalette();
      H.commandPalette()
        .findByRole("option", { name: "Orders, Count" })
        .find(".Icon-verified_filled")
        .should("not.exist");
      H.commandPaletteInput().type("Orders");
      H.commandPalette()
        .findByRole("option", { name: "Orders, Count" })
        .find(".Icon-verified_filled")
        .should("not.exist");
      H.closeCommandPalette();

      H.commandPaletteSearch("orders");
      cy.log(
        "The question lost the verification status and does not appear high in search results anymore",
      );
      cy.findAllByTestId("search-result-item")
        .as("searchResults")
        .first()
        .should("not.contain", "Orders, Count");
      cy.log("Verified icon should not appear at all in search results");
      cy.get("@searchResults").icon("verified").should("not.exist");
    });

    it("should not treat the dashboard as verified anymore", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      cy.findByTestId("dashboard-header").within(() => {
        cy.findByText("Orders in a dashboard");
        cy.icon("verified").should("not.exist");
      });

      H.openDashboardInfoSidebar();
      H.sidesheet().within(() => {
        cy.findByRole("tab", { name: "History" }).click();
        cy.contains(/created this./);
        cy.contains(/verified this/).should("not.exist");
      });
      cy.findByLabelText("Close").click();

      H.commandPaletteSearch("orders");
      cy.log(
        "The question lost the verification status and does not appear high in search results anymore",
      );
      cy.findAllByTestId("search-result-item")
        .as("searchResults")
        .first()
        .should("not.contain", "Orders in a dashboard");
      cy.log("Verified icon should not appear at all in search results");
      cy.get("@searchResults").icon("verified").should("not.exist");
    });
  });
});

function verifyQuestion() {
  cy.intercept("GET", "/api/card/*").as("loadCard");

  H.openQuestionActions();
  cy.findByTextEnsureVisible("Verify this question").click();

  cy.wait("@loadCard").then(({ response: { body } }) => {
    const { moderation_reviews } = body;

    /**
     * According to Dan's analysis, the reason behind intermittent failures in this test
     * could be the errors in H2 (app db).
     * More info: https://metaboat.slack.com/archives/C505ZNNH4/p1657300770484219?thread_ts=1657295926.728949&cid=C505ZNNH4
     *
     * We observed that even when the click on "Verify this question" was successful,
     * the response still shows `moderation_reviews` as an empty array.
     *
     * Therefore, we have to conditionally skip this test if that error occurs.
     */
    if (Array.isArray(moderation_reviews) && moderation_reviews.length === 0) {
      cy.skipOn(true);
    } else {
      const [{ status }] = moderation_reviews;

      expect(status).to.eq("verified");
    }
  });
}

function verifyDashboard() {
  cy.intercept("GET", "/api/dashboard/*").as("loadDashboard");

  H.openDashboardMenu();
  cy.findByTextEnsureVisible("Verify this dashboard").click();

  cy.wait("@loadDashboard").then(({ response: { body } }) => {
    const { moderation_reviews } = body;

    /**
     * According to Dan's analysis, the reason behind intermittent failures in this test
     * could be the errors in H2 (app db).
     * More info: https://metaboat.slack.com/archives/C505ZNNH4/p1657300770484219?thread_ts=1657295926.728949&cid=C505ZNNH4
     *
     * We observed that even when the click on "Verify this question" was successful,
     * the response still shows `moderation_reviews` as an empty array.
     *
     * Therefore, we have to conditionally skip this test if that error occurs.
     */
    if (Array.isArray(moderation_reviews) && moderation_reviews.length === 0) {
      cy.skipOn(true);
    } else {
      const [{ status }] = moderation_reviews;

      expect(status).to.eq("verified");
    }
  });
}

function removeQuestionVerification() {
  H.openQuestionActions();
  cy.findByTextEnsureVisible("Remove verification").click();
}

function removeDashboardVerification() {
  H.openDashboardMenu();
  cy.findByTextEnsureVisible("Remove verification").click();
}
