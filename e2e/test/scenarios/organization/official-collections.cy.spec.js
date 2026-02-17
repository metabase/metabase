const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const COLLECTION_NAME = "Official Collection Test";

const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

describe("official collections", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  context("without a token", () => {
    it("should not be able to manage collection's authority level", () => {
      // Gate the API
      cy.request({
        method: "POST",
        url: "/api/collection",
        failOnStatusCode: false,
        body: {
          name: "Wannabe Official Collection",
          authority_level: "official",
        },
      }).then(({ body, status, statusText }) => {
        expect(body).to.deep.include(
          H.getPartialPremiumFeatureError("Official Collections"),
        );
        expect(status).to.eq(402);
        expect(statusText).to.eq("Payment Required");
      });

      // Gate the UI
      cy.visit("/collection/root");

      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal").then((modal) => {
        assertNoCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });

      openCollection("First collection");
      H.openCollectionMenu();
      assertNoCollectionTypeOption();
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => H.activateToken("pro-self-hosted"));

    it("should be able to manage collection authority level", () => {
      cy.visit("/collection/root");

      createAndOpenOfficialCollection({ name: COLLECTION_NAME });
      cy.findByTestId("official-collection-marker");
      assertSidebarIcon(COLLECTION_NAME, "official_collection");

      changeCollectionTypeTo("regular");
      cy.findByTestId("official-collection-marker").should("not.exist");
      assertSidebarIcon(COLLECTION_NAME, "folder");

      changeCollectionTypeTo("official");
      cy.findByTestId("official-collection-marker");
      assertSidebarIcon(COLLECTION_NAME, "official_collection");
    });

    it("displays official badge throughout the application", () => {
      testOfficialBadgePresence();
    });

    it("should display a badge next to official questions in regular dashboards", () => {
      testOfficialQuestionBadgeInRegularDashboard();
    });

    it("should not see collection type field if not admin", () => {
      cy.signInAsNormalUser();
      cy.visit("/collection/root");

      openCollection("First collection");

      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal").then((modal) => {
        assertNoCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });

      H.openCollectionMenu();
      H.popover().within(() => {
        assertNoCollectionTypeOption();
      });
    });

    it("should be able to manage collection authority level for personal collections and their children (metabase#30236)", () => {
      cy.visit("/collection/root");

      openCollection("Your personal collection");
      H.getCollectionActions().within(() => {
        cy.icon("ellipsis").should("exist");
        cy.icon("ellipsis").click();
      });

      H.popover().findByText("Make collection official").should("exist");

      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal").then((modal) => {
        assertHasCollectionTypeInput();
        cy.findByPlaceholderText("My new fantastic collection").type(
          "Personal collection child",
        );
        cy.findByText("Create").click();
      });

      openCollection("Personal collection child");

      H.getCollectionActions().within(() => {
        cy.icon("ellipsis").should("exist");
        cy.icon("ellipsis").click();
      });
      H.popover().findByText("Make collection official").should("exist");

      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal").then((modal) => {
        assertHasCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });
    });
  });

  context("token expired or removed", () => {
    beforeEach(() => H.activateToken("pro-self-hosted"));

    it("should not display official collection icon anymore", () => {
      testOfficialBadgePresence(false);
    });

    it("should display questions belonging to previously official collections as regular in regular dashboards", () => {
      testOfficialQuestionBadgeInRegularDashboard(false);
    });
  });
});

function testOfficialBadgePresence(expectBadge = true) {
  H.createCollection({
    name: COLLECTION_NAME,
    authority_level: "official",
  }).then((response) => {
    const { id: collectionId } = response.body;
    H.createQuestion({
      name: "Official Question",
      collection_id: collectionId,
      query: TEST_QUESTION_QUERY,
    });
    H.createDashboard({
      name: "Official Dashboard",
      collection_id: collectionId,
    });

    if (!expectBadge) {
      H.deleteToken();
    }
    cy.visit(`/collection/${collectionId}`);
  });

  // Dashboard Page
  cy.findByText("Official Dashboard").click();
  assertHasCollectionBadgeInNavbar(expectBadge);

  // Question Page
  cy.get("header").findByText(COLLECTION_NAME).click();
  cy.findByText("Official Question").click();
  assertHasCollectionBadgeInNavbar(expectBadge);

  // Search
  testOfficialBadgeInSearch({
    searchQuery: "Official",
    collection: COLLECTION_NAME,
    dashboard: "Official Dashboard",
    question: "Official Question",
    expectBadge,
  });
}

// The helper accepts a single search query,
// and relies on collection, dashboard and question being found within this single query
function testOfficialBadgeInSearch({
  searchQuery,
  collection,
  dashboard,
  question,
  expectBadge,
}) {
  H.commandPaletteSearch(searchQuery);

  cy.findByTestId("search-app").within(() => {
    assertSearchResultBadge(collection, {
      expectBadge,
      selector: "[data-testid='search-result-item-name']",
    });
    assertSearchResultBadge(question, { expectBadge });
    assertSearchResultBadge(dashboard, { expectBadge });
  });
}

function testOfficialQuestionBadgeInRegularDashboard(expectBadge = true) {
  H.createCollection({
    name: COLLECTION_NAME,
    authority_level: "official",
  }).then((response) => {
    const { id: collectionId } = response.body;
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Official Question",
        collection_id: collectionId,
        query: TEST_QUESTION_QUERY,
      },
      dashboardDetails: { name: "Regular Dashboard" },
    });
  });

  if (!expectBadge) {
    H.deleteToken();
  }

  cy.visit("/collection/root");
  cy.findByText("Regular Dashboard").click();

  cy.findByTestId("dashboard-grid")
    .icon("official_collection")
    .should(expectBadge ? "exist" : "not.exist");
}

function openCollection(collectionName) {
  H.navigationSidebar().findByText(collectionName).click();
}

function createAndOpenOfficialCollection({ name }) {
  H.startNewCollectionFromSidebar();
  cy.findByTestId("new-collection-modal").then((modal) => {
    cy.findByPlaceholderText("My new fantastic collection").type(name);
    cy.findByText("Official").click();
    cy.findByText("Create").click();
  });
  H.navigationSidebar().within(() => {
    cy.findByText(name).click();
  });
}

function changeCollectionTypeTo(type) {
  H.openCollectionMenu();
  H.popover().within(() => {
    if (type === "official") {
      cy.findByText("Make collection official").click();
    } else {
      cy.findByText("Remove Official badge").click();
    }
  });
}

function assertNoCollectionTypeInput() {
  cy.findByText(/Collection type/i).should("not.exist");
  cy.findByText("Regular").should("not.exist");
  cy.findByText("Official").should("not.exist");
}

function assertHasCollectionTypeInput() {
  cy.findByText(/Collection type/i).should("exist");
  cy.findByText("Regular").should("exist");
  cy.findByText("Official").should("exist");
}

function assertNoCollectionTypeOption() {
  cy.findByText("Make collection official").should("not.exist");
  cy.findByText("Remove Official badge").should("not.exist");
}

function assertSidebarIcon(collectionName, expectedIcon) {
  H.navigationSidebar()
    .findByText(collectionName)
    .parent()
    .within(() => {
      cy.icon(expectedIcon);
    });
}

function assertSearchResultBadge(itemName, opts) {
  const { expectBadge } = opts;
  cy.findByText(itemName, opts)
    .parentsUntil("[data-testid=search-result-item]")
    .parent()
    .first()
    .within(() => {
      cy.icon("official_collection").should(
        expectBadge ? "exist" : "not.exist",
      );
    });
}

const assertHasCollectionBadgeInNavbar = (expectBadge = true) => {
  cy.get("header")
    .findByText(COLLECTION_NAME)
    .parent()
    .within(() => {
      cy.icon("official_collection").should(
        expectBadge ? "exist" : "not.exist",
      );
      if (expectBadge) {
        cy.icon("official_collection").should("be.visible");
      }
    });
};
