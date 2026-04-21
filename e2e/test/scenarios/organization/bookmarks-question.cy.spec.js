const { H } = cy;
import {
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { toggleQuestionBookmarkStatus } from "./helpers/bookmark-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should add, update bookmark name when question name is updated, then remove bookmark from question page", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    toggleQuestionBookmarkStatus();

    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "question",
      triggered_from: "qb_action_panel",
    });

    H.openNavigationSidebar();
    H.navigationSidebar().within(() => {
      H.getSidebarSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    // Rename bookmarked question
    cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

    H.navigationSidebar().within(() => {
      cy.findByText("Orders 2");
    });

    cy.log("Turn the question into a model");
    H.openQuestionActions();
    cy.findByRole("menu").contains("Turn into a model").click();
    cy.findByRole("dialog").contains("Turn this into a model").click();

    H.undoToastList().findByText("This is a model now.");
    // Close this toast as soon we confim it exists!
    // It lingers in the UI far too long which is causing flakiness later on
    // when we assert on the next toast (when we turn the model back to the question).
    H.undoToastList().icon("close").click();

    H.openNavigationSidebar();
    H.navigationSidebar().within(() => {
      cy.findByRole("section", { name: "Bookmarks" })
        .icon("model")
        .should("exist");
    });

    cy.log("Turn the model back into a question");
    H.openQuestionActions();
    cy.findByRole("menu").contains("Turn back to saved question").click();
    H.undoToastList().should("contain", "This is a question now.");

    H.openNavigationSidebar();
    cy.log("Should not find bookmark");
    H.navigationSidebar().within(() => {
      cy.findByRole("section", { name: "Bookmarks" })
        .icon("model")
        .should("not.exist");
    });

    // Remove bookmark
    toggleQuestionBookmarkStatus({ wasSelected: true });
    H.expectUnstructuredSnowplowEvent(
      {
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "qb_action_panel",
      },
      1,
    );

    H.navigationSidebar().within(() => {
      H.getSidebarSectionTitle(/Bookmarks/).should("not.exist");
      cy.findByText("Orders 2").should("not.exist");
    });
  });

  it("should bookmark a model", () => {
    H.visitModel(ORDERS_MODEL_ID);

    toggleQuestionBookmarkStatus();
    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "model",
      triggered_from: "qb_action_panel",
    });

    cy.log(
      "Remove a bookmark and expect the number of events to stay the same",
    );
    toggleQuestionBookmarkStatus({ wasSelected: true });
    H.expectUnstructuredSnowplowEvent(
      {
        event: "bookmark_added",
        event_detail: "model",
        triggered_from: "qb_action_panel",
      },
      1,
    );
  });
});
