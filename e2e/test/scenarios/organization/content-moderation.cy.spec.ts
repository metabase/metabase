const { H } = cy;
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

/**
 * Smoke tests for official collections and content verification. They write
 * through the real backend and check the result after a reload.
 *
 * The UI-only checks (token gating, admin-only menu items, badges in search,
 * breadcrumbs and dashboard cards) live in Jest:
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
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    assertVerificationRoundTrip({
      itemId: ORDERS_COUNT_QUESTION_ID,
      itemType: "card",
      itemName: "Orders, Count",
      headerTestId: "qb-header",
      verifyLabel: "Verify this question",
      openMenu: () => H.openQuestionActions(),
    });
  });

  it("admin can verify and unverify a dashboard", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    assertVerificationRoundTrip({
      itemId: ORDERS_DASHBOARD_ID,
      itemType: "dashboard",
      itemName: "Orders in a dashboard",
      headerTestId: "dashboard-header",
      verifyLabel: "Verify this dashboard",
      openMenu: () => H.openDashboardMenu(),
    });
  });
});

function assertVerificationRoundTrip({
  itemId,
  itemType,
  itemName,
  headerTestId,
  verifyLabel,
  openMenu,
}: {
  itemId: number;
  itemType: "card" | "dashboard";
  itemName: string;
  headerTestId: string;
  verifyLabel: string;
  openMenu: () => void;
}) {
  cy.intercept("POST", "/api/moderation-review").as("moderationReview");

  cy.log("Verify the item");
  openMenu();
  cy.findByTextEnsureVisible(verifyLabel).click();
  cy.wait("@moderationReview").its("request.body").should("deep.equal", {
    moderated_item_id: itemId,
    moderated_item_type: itemType,
    status: "verified",
  });
  cy.findByTestId(headerTestId).icon("verified").should("be.visible");

  cy.reload();
  cy.findByTestId(headerTestId).icon("verified").should("be.visible");

  cy.log("Remove verification");
  openMenu();
  cy.findByTextEnsureVisible("Remove verification").click();
  cy.wait("@moderationReview").its("request.body").should("deep.equal", {
    moderated_item_id: itemId,
    moderated_item_type: itemType,
    status: null,
  });
  cy.findByTestId(headerTestId).icon("verified").should("not.exist");

  cy.reload();
  cy.findByTestId(headerTestId).should("contain", itemName);
  cy.findByTestId(headerTestId).icon("verified").should("not.exist");
}

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
