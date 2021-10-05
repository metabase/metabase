import {
  restore,
  modal,
  sidebar,
  describeWithToken,
  describeWithoutToken,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const COLLECTION_NAME = "Official Collection Test";

const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

describeWithToken("collections types", () => {
  beforeEach(() => {
    restore();
  });

  const TREE_UPDATE_REGULAR_MESSAGE = "Make all sub-collections Regular, too.";
  const TREE_UPDATE_OFFICIAL_MESSAGE =
    "Make all sub-collections Official, too.";

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

  it("should be able to update authority level for collection children", () => {
    cy.signInAsAdmin();
    cy.visit("/collection/root");
    cy.findByText("First collection").click();

    // Test not visible when creating a new collection
    cy.icon("new_folder").click();
    modal().within(() => {
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).should("not.exist");
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).should("not.exist");
      setOfficial();
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).should("not.exist");
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).should("not.exist");
      cy.icon("close").click();
    });

    // Test can make all children official
    editCollection();
    modal().within(() => {
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).should("not.exist");
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).should("not.exist");
      setOfficial();
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).should("not.exist");
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).click();
      cy.button("Update").click();
    });

    getSidebarCollectionChildrenFor("First collection").within(() => {
      expandCollectionChildren("Second collection");
      cy.icon("badge").should("have.length", 3);
      cy.icon("folder").should("not.exist");
    });

    // Test can make all children regular
    editCollection();
    modal().within(() => {
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).should("not.exist");
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).should("not.exist");
      setOfficial(false);
      cy.findByText(TREE_UPDATE_REGULAR_MESSAGE).click();
      cy.findByText(TREE_UPDATE_OFFICIAL_MESSAGE).should("not.exist");
      cy.button("Update").click();
    });

    getSidebarCollectionChildrenFor("First collection").within(() => {
      expandCollectionChildren("Second collection");
      cy.icon("folder").should("have.length", 3);
      cy.icon("badge").should("not.exist");
    });
  });

  it("should not see collection type field if not admin", () => {
    cy.signIn("normal");
    cy.visit("/collection/root");

    openCollection("First collection");

    cy.icon("new_folder").click();
    modal().within(() => {
      assertNoCollectionTypeInput();
      cy.icon("close").click();
    });

    editCollection();
    modal().within(() => {
      assertNoCollectionTypeInput();
    });
  });

  it("should not be able to manage collection authority level for personal collections and their children", () => {
    cy.signInAsAdmin();
    cy.visit("/collection/root");

    openCollection("Your personal collection");
    cy.icon("pencil").should("not.exist");

    cy.icon("new_folder").click();
    modal().within(() => {
      assertNoCollectionTypeInput();
      cy.findByLabelText("Name").type("Personal collection child");
      cy.button("Create").click();
    });

    openCollection("Personal collection child");

    cy.icon("new_folder").click();
    modal().within(() => {
      assertNoCollectionTypeInput();
      cy.icon("close").click();
    });
  });
});

describeWithoutToken("collection types", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not be able to manage collection's authority level", () => {
    cy.visit("/collection/root");

    cy.icon("new_folder").click();
    modal().within(() => {
      assertNoCollectionTypeInput();
      cy.icon("close").click();
    });

    openCollection("First collection");
    editCollection();
    modal().within(() => {
      assertNoCollectionTypeInput();
    });
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
  assertHasCollectionBadge(expectBadge);

  // Question Page
  cy.findByText(COLLECTION_NAME).click();
  cy.findByText("Official Question").click();
  assertHasCollectionBadge(expectBadge);

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
  cy.get(".Nav")
    .findByPlaceholderText("Search…")
    .as("searchBar")
    .type(searchQuery);

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
  sidebar()
    .findByText(collectionName)
    .click();
}

function editCollection() {
  cy.icon("pencil").click();
  cy.findByText("Edit this collection").click();
}

function expandCollectionChildren(collectionName) {
  cy.findByText(collectionName)
    .parent()
    .find(".Icon-chevronright")
    .eq(0) // there may be more nested icons, but we need the top level one
    .click();
}

function getSidebarCollectionChildrenFor(collectionName) {
  return sidebar()
    .findByText(collectionName)
    .closest("a")
    .parent()
    .parent();
}

function setOfficial(official = true) {
  const isOfficialNow = !official;
  cy.findByLabelText("Regular").should(
    isOfficialNow ? "not.be.checked" : "be.checked",
  );
  cy.findByLabelText("Official").should(
    isOfficialNow ? "be.checked" : "not.be.checked",
  );
  cy.findByText(official ? "Official" : "Regular").click();
}

function createAndOpenOfficialCollection({ name }) {
  cy.icon("new_folder").click();
  modal().within(() => {
    cy.findByLabelText("Name").type(name);
    setOfficial();
    cy.button("Create").click();
  });
  cy.findByText(name).click();
}

function changeCollectionTypeTo(type) {
  editCollection();
  modal().within(() => {
    setOfficial(type === "official");
    cy.button("Update").click();
  });
}

function assertNoCollectionTypeInput() {
  cy.findByText(/Collection type/i).should("not.exist");
  cy.findByText("Regular").should("not.exist");
  cy.findByText("Official").should("not.exist");
}

function assertSidebarIcon(collectionName, expectedIcon) {
  sidebar()
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
    .within(() => {
      cy.icon("badge").should(expectBadge ? "exist" : "not.exist");
    });
}

function assertHasCollectionBadge(expectBadge = true) {
  cy.findByText(COLLECTION_NAME)
    .parent()
    .within(() => {
      cy.icon("badge").should(expectBadge ? "exist" : "not.exist");
    });
}
