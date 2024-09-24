import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  commandPaletteSearch,
  describeEE,
  getCollectionActions,
  navigationSidebar,
  openCollectionMenu,
  openNewCollectionItemFlowFor,
  popover,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const COLLECTION_NAME = "Official Collection Test";

const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

describeEE("official collections", () => {
  beforeEach(() => {
    restore();
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
        expect(body).to.eq(
          "Official Collections is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/",
        );
        expect(status).to.eq(402);
        expect(statusText).to.eq("Payment Required");
      });

      // Gate the UI
      cy.visit("/collection/root");

      openNewCollectionItemFlowFor("collection");
      cy.findByTestId("new-collection-modal").then(modal => {
        assertNoCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });

      openCollection("First collection");
      openCollectionMenu();
      assertNoCollectionTypeOption();
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => setTokenFeatures("all"));

    it("should be able to manage collection authority level", () => {
      cy.visit("/collection/root");

      createAndOpenOfficialCollection({ name: COLLECTION_NAME });
      cy.findByTestId("official-collection-marker");
      assertSidebarIcon(COLLECTION_NAME, "verified_collection");

      changeCollectionTypeTo("regular");
      cy.findByTestId("official-collection-marker").should("not.exist");
      assertSidebarIcon(COLLECTION_NAME, "folder");

      changeCollectionTypeTo("official");
      cy.findByTestId("official-collection-marker");
      assertSidebarIcon(COLLECTION_NAME, "verified_collection");
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

      openNewCollectionItemFlowFor("collection");
      cy.findByTestId("new-collection-modal").then(modal => {
        assertNoCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });

      openCollectionMenu();
      popover().within(() => {
        assertNoCollectionTypeOption();
      });
    });

    it("should be able to manage collection authority level for personal collections and their children (metabase#30236)", () => {
      cy.visit("/collection/root");

      openCollection("Your personal collection");
      getCollectionActions().within(() => {
        cy.icon("ellipsis").should("exist");
        cy.icon("ellipsis").click();
      });

      popover().findByText("Make collection official").should("exist");

      openNewCollectionItemFlowFor("collection");
      cy.findByTestId("new-collection-modal").then(modal => {
        assertHasCollectionTypeInput();
        cy.findByPlaceholderText("My new fantastic collection").type(
          "Personal collection child",
        );
        cy.findByText("Create").click();
      });

      openCollection("Personal collection child");

      getCollectionActions().within(() => {
        cy.icon("ellipsis").should("exist");
        cy.icon("ellipsis").click();
      });
      popover().findByText("Make collection official").should("exist");

      openNewCollectionItemFlowFor("collection");
      cy.findByTestId("new-collection-modal").then(modal => {
        assertHasCollectionTypeInput();
        cy.findByLabelText("Close").click();
      });
    });
  });

  context("token expired or removed", () => {
    beforeEach(() => setTokenFeatures("all"));
    it("should not display official collection icon anymore", () => {
      testOfficialBadgePresence(false);
    });

    it("should display questions belonging to previously official collections as regular in regular dashboards", () => {
      testOfficialQuestionBadgeInRegularDashboard(false);
    });
  });
});

function testOfficialBadgePresence(expectBadge = true) {
  cy.createCollection({
    name: COLLECTION_NAME,
    authority_level: "official",
  }).then(response => {
    const { id: collectionId } = response.body;
    cy.createQuestion({
      name: "Official Question",
      collection_id: collectionId,
      query: TEST_QUESTION_QUERY,
    });
    cy.createDashboard({
      name: "Official Dashboard",
      collection_id: collectionId,
    });

    !expectBadge && setTokenFeatures("none");
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
  commandPaletteSearch(searchQuery);

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
  cy.createCollection({
    name: COLLECTION_NAME,
    authority_level: "official",
  }).then(response => {
    const { id: collectionId } = response.body;
    cy.createQuestionAndDashboard({
      questionDetails: {
        name: "Official Question",
        collection_id: collectionId,
        query: TEST_QUESTION_QUERY,
      },
      dashboardDetails: { name: "Regular Dashboard" },
    });
  });

  !expectBadge && setTokenFeatures("none");

  cy.visit("/collection/root");
  cy.findByText("Regular Dashboard").click();

  cy.findByTestId("dashboard-grid")
    .icon("verified_collection")
    .should(expectBadge ? "exist" : "not.exist");
}

function openCollection(collectionName) {
  navigationSidebar().findByText(collectionName).click();
}

function createAndOpenOfficialCollection({ name }) {
  openNewCollectionItemFlowFor("collection");
  cy.findByTestId("new-collection-modal").then(modal => {
    cy.findByPlaceholderText("My new fantastic collection").type(name);
    cy.findByText("Official").click();
    cy.findByText("Create").click();
  });
  navigationSidebar().within(() => {
    cy.findByText(name).click();
  });
}

function changeCollectionTypeTo(type) {
  openCollectionMenu();
  popover().within(() => {
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
  navigationSidebar()
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
      cy.icon("verified_collection").should(
        expectBadge ? "exist" : "not.exist",
      );
    });
}

const assertHasCollectionBadgeInNavbar = (expectBadge = true) => {
  cy.get("header")
    .findByText(COLLECTION_NAME)
    .parent()
    .within(() => {
      cy.icon("verified_collection").should(
        expectBadge ? "exist" : "not.exist",
      );
      if (expectBadge) {
        cy.icon("verified_collection").should("be.visible");
      }
    });
};
