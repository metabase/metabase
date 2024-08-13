import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  restore,
  visitQuestion,
  openQuestionActions,
  questionInfoButton,
  setTokenFeatures,
  popover,
  openCommandPalette,
  commandPalette,
  closeCommandPalette,
  commandPaletteSearch,
} from "e2e/support/helpers";

describeEE("scenarios > premium > content verification", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("without a token", () => {
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
        expect(body).to.eq(
          "Content verification is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/",
        );
        expect(status).to.eq(402);
        expect(statusText).to.eq("Payment Required");
      });

      cy.log("Gate the UI");
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openQuestionActions();
      popover()
        .should("contain", "Add to dashboard")
        .and("not.contain", "Verify this question");

      cy.log("Turn the question into a model and try again");
      cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        type: "model",
      });

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.visit(`/model/${ORDERS_COUNT_QUESTION_ID}`);
      cy.wait("@dataset");

      openQuestionActions();
      popover()
        .should("contain", "Edit query definition")
        .and("not.contain", "Verify this question");
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => setTokenFeatures("all"));

    describe("an admin", () => {
      it("should be able to verify and unverify a saved question", () => {
        visitQuestion(ORDERS_COUNT_QUESTION_ID);

        verifyQuestion();

        // 1. Question title
        cy.findByTestId("qb-header").within(() => {
          cy.findByText("Orders, Count");
          cy.icon("verified");
        });

        // 2. Question's history
        questionInfoButton().click();
        cy.findByTestId("sidebar-right").within(() => {
          cy.findByText("History");
          cy.findAllByText("You verified this")
            .should("have.length", 2)
            .and("be.visible");
        });

        // 3. Recently viewed list
        openCommandPalette();
        commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled");
        closeCommandPalette();

        // 4. Search results
        commandPaletteSearch("orders");
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
        visitQuestion(ORDERS_COUNT_QUESTION_ID);

        removeQuestionVerification();

        // 1. Question title
        cy.findByTestId("qb-header-left-side")
          .find(".Icon-verified")
          .should("not.exist");

        // 2. Question's history
        questionInfoButton().click();
        cy.findByTestId("sidebar-right").within(() => {
          cy.findByText("History");
          cy.findByText("You removed verification");
          cy.findByText("You verified this"); // Implicit assertion - there can be only one :)
        });

        // 3. Recently viewed list
        openCommandPalette();
        commandPalette()
          .findByRole("option", { name: "Orders, Count" })
          .find(".Icon-verified_filled")
          .should("not.exist");
        closeCommandPalette();

        // 4. Search results
        commandPaletteSearch("orders");
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
    });

    describe("non-admin user", () => {
      beforeEach(() => {
        cy.createModerationReview({
          status: "verified",
          moderated_item_type: "card",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
        });

        cy.signInAsNormalUser();
      });

      it("should be able to see that a question has been verified but can't moderate the question themselves", () => {
        visitQuestion(ORDERS_COUNT_QUESTION_ID);

        cy.findByTestId("qb-header").within(() => {
          cy.findByText("Orders, Count");
          cy.icon("verified");
        });

        cy.log("Non-admin users cannot change question verification status.");
        openQuestionActions();
        popover()
          .should("contain", "Add to dashboard")
          .and("not.contain", "Remove verification");

        questionInfoButton().click();
        cy.findByTestId("sidebar-right")
          .findAllByText("A moderator verified this")
          .should("have.length", 2);

        commandPaletteSearch("orders");
        cy.log("Verified content should show up higher in search results");
        cy.findAllByTestId("search-result-item")
          .first()
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
    });
  });

  context("token expired or removed", () => {
    beforeEach(() => {
      setTokenFeatures("all");
      cy.createModerationReview({
        status: "verified",
        moderated_item_type: "card",
        moderated_item_id: ORDERS_COUNT_QUESTION_ID,
      });

      setTokenFeatures("none");
    });

    it("should not treat the question as verified anymore", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);

      cy.findByTestId("qb-header").within(() => {
        cy.findByText("Orders, Count");
        cy.icon("verified").should("not.exist");
      });

      questionInfoButton().click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.contains(/created this./);
        cy.contains(/verified this/).should("not.exist");
      });

      commandPaletteSearch("orders");
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
  });
});

function verifyQuestion() {
  cy.intercept("GET", "/api/card/*").as("loadCard");

  openQuestionActions();
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

function removeQuestionVerification() {
  openQuestionActions();
  cy.findByTextEnsureVisible("Remove verification").click();
}
