import {
  restore,
  modal,
  describeEE,
  isOSS,
  openNewCollectionItemFlowFor,
  appBar,
  navigationSidebar,
  closeNavigationSidebar,
  getCollectionActions,
  popover,
  openCollectionMenu,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const COLLECTION_NAME = "Official Collection Test";

const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

describeEE("collections types", () => {
  beforeEach(() => {
    restore();
  });

  it("should be able to manage collection authority level", () => {
    cy.signInAsAdmin();
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
    cy.signInAsAdmin();
    testOfficialBadgePresence();
  });

  it("should display a badge next to official questions in regular dashboards", () => {
    cy.signInAsAdmin();
    testOfficialQuestionBadgeInRegularDashboard();
  });

  it("should not see collection type field if not admin", () => {
    cy.signIn("normal");
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
    cy.signInAsAdmin();
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

describe("collection types", { tags: "@OSS" }, () => {
  beforeEach(() => {
    cy.onlyOn(isOSS);

    restore();
    cy.signInAsAdmin();
  });

  it("should not be able to manage collection's authority level", () => {
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

  it("should not display official collection icon", () => {
    testOfficialBadgePresence(false);
  });

  it("should display official questions as regular in regular dashboards", () => {
    testOfficialQuestionBadgeInRegularDashboard(false);
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
