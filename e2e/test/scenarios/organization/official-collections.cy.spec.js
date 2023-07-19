import {
  restore,
  modal,
  describeEE,
  openNewCollectionItemFlowFor,
  appBar,
  navigationSidebar,
  closeNavigationSidebar,
  getCollectionActions,
  popover,
  openCollectionMenu,
  setTokenFeatures,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
          color: "#000000",
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
      modal().within(() => {
        assertNoCollectionTypeInput();
        cy.icon("close").click();
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
      assertSidebarIcon(COLLECTION_NAME, "badge");

      changeCollectionTypeTo("regular");
      cy.findByTestId("official-collection-marker").should("not.exist");
      assertSidebarIcon(COLLECTION_NAME, "folder");

      changeCollectionTypeTo("official");
      cy.findByTestId("official-collection-marker");
      assertSidebarIcon(COLLECTION_NAME, "badge");
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
      modal().within(() => {
        assertNoCollectionTypeInput();
        cy.icon("close").click();
      });

      openCollectionMenu();
      popover().within(() => {
        assertNoCollectionTypeOption();
      });
    });

    it("should not be able to manage collection authority level for personal collections and their children", () => {
      cy.visit("/collection/root");

      openCollection("Your personal collection");
      getCollectionActions().within(() => {
        cy.icon("ellipsis").should("not.exist");
      });

      openNewCollectionItemFlowFor("collection");
      modal().within(() => {
        assertNoCollectionTypeInput();
        cy.findByLabelText("Name").type("Personal collection child");
        cy.button("Create").click();
      });

      openCollection("Personal collection child");

      openNewCollectionItemFlowFor("collection");
      modal().within(() => {
        assertNoCollectionTypeInput();
        cy.icon("close").click();
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
  appBar().findByPlaceholderText("Search…").as("searchBar").type(searchQuery);

  cy.findByTestId("search-results-list").within(() => {
    assertSearchResultBadge(collection, {
      expectBadge,
      selector: "h3",
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

  cy.get(".DashboardGrid").within(() => {
    cy.icon("badge").should(expectBadge ? "exist" : "not.exist");
  });
}

function openCollection(collectionName) {
  navigationSidebar().findByText(collectionName).click();
}

function createAndOpenOfficialCollection({ name }) {
  openNewCollectionItemFlowFor("collection");
  modal().within(() => {
    cy.findByLabelText("Name").type(name);
    cy.findByText("Official").click();
    cy.button("Create").click();
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
    .last()
    .within(() => {
      cy.icon("badge").should(expectBadge ? "exist" : "not.exist");
    });
}

const assertHasCollectionBadgeInNavbar = (expectBadge = true) => {
  closeNavigationSidebar();
  cy.get("header")
    .findByText(COLLECTION_NAME)
    .parent()
    .within(() => {
      cy.icon("badge").should(expectBadge ? "exist" : "not.exist");
      if (expectBadge) {
        cy.icon("badge").should("be.visible");
      }
    });
};
