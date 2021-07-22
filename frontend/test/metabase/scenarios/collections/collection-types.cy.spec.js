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
    cy.signInAsAdmin();
  });

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

    cy.findByText("First collection").click();
    editCollection();
    modal().within(() => {
      assertNoCollectionTypeInput();
    });
  });

  it("should not display official collection icon", () => {
    testOfficialBadgePresence(false);
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
    cy.createDashboard("Official Dashboard", { collection_id: collectionId });
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

function editCollection() {
  cy.icon("pencil").click();
  cy.findByText("Edit this collection").click();
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
