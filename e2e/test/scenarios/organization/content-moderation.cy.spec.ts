const { H } = cy;
import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

/**
 * Smoke tests for official collections and content verification. They write
 * through the real backend and check the result after a reload.
 *
 * The UI-only checks (token gating, admin-only menu items, badges in search,
 * breadcrumbs and dashboard cards, dashboard verification) live in Jest:
 * - frontend/src/metabase/collections/components/CollectionMenu/tests/
 * - frontend/src/metabase/common/collections/components/CreateCollectionForm/tests/
 * - frontend/src/metabase/app/nav/AppBar.unit.spec.tsx
 * - frontend/src/metabase/common/components/SearchResult/tests/SearchResult-Collections.unit.spec.tsx
 * - frontend/src/metabase/dashboard/components/DashCard/Dashcard.unit.spec.tsx
 * - frontend/src/metabase/dashboard/components/DashboardHeader/tests/premium.unit.spec.tsx
 *
 * The backend gates live in
 * enterprise/backend/test/metabase_enterprise/content_verification/api/.
 */

const COLLECTION_NAME = "Official Collection Test";

describe("scenarios > premium > content moderation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("admin can make a collection official and remove the badge", () => {
    cy.intercept("POST", "/api/collection").as("createCollection");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");

    cy.visit("/collection/root");

    H.startNewCollectionFromSidebar();
    cy.findByTestId("new-collection-modal").within(() => {
      cy.findByPlaceholderText("My new fantastic collection").type(
        COLLECTION_NAME,
      );
      cy.findByText("Official").click();
      cy.button("Create").click();
    });
    cy.wait("@createCollection").its("request.body").should("deep.include", {
      name: COLLECTION_NAME,
      authority_level: "official",
    });

    H.navigationSidebar().findByText(COLLECTION_NAME).click();
    assertOfficialCollection(true);

    cy.log("Remove the badge");
    changeCollectionTypeTo("regular");
    cy.wait("@updateCollection")
      .its("request.body")
      .should("deep.include", { authority_level: null });
    assertOfficialCollection(false);

    cy.reload();
    assertOfficialCollection(false);

    cy.log("Make the collection official again");
    changeCollectionTypeTo("official");
    cy.wait("@updateCollection")
      .its("request.body")
      .should("deep.include", { authority_level: "official" });
    assertOfficialCollection(true);

    cy.reload();
    assertOfficialCollection(true);
  });

  it("admin can verify and unverify a question", () => {
    cy.intercept("POST", "/api/moderation-review").as("moderationReview");

    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

    cy.log("Verify the question");
    H.openQuestionActions();
    cy.findByTextEnsureVisible("Verify this question").click();
    cy.wait("@moderationReview").its("response.statusCode").should("eq", 200);
    cy.findByTestId("qb-header").icon("verified").should("be.visible");

    cy.reload();
    cy.findByTestId("qb-header").icon("verified").should("be.visible");

    cy.log("Remove verification");
    H.openQuestionActions();
    cy.findByTextEnsureVisible("Remove verification").click();
    cy.wait("@moderationReview").its("response.statusCode").should("eq", 200);
    cy.findByTestId("qb-header").icon("verified").should("not.exist");

    cy.reload();
    cy.findByTestId("qb-header").should("contain", "Orders, Count");
    cy.findByTestId("qb-header").icon("verified").should("not.exist");
  });
});

function changeCollectionTypeTo(type: "official" | "regular") {
  H.openCollectionMenu();
  H.popover()
    .findByText(
      type === "official"
        ? "Make collection official"
        : "Remove Official badge",
    )
    .click();
}

function assertOfficialCollection(isOfficial: boolean) {
  cy.findByTestId("collection-name-heading").should(
    "have.value",
    COLLECTION_NAME,
  );
  cy.findByTestId("official-collection-marker").should(
    isOfficial ? "exist" : "not.exist",
  );
  H.navigationSidebar()
    .findByText(COLLECTION_NAME)
    .parent()
    .within(() => {
      cy.icon(isOfficial ? "official_collection" : "folder").should("exist");
    });
}
