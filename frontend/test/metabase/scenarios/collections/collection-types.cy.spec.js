import {
  restore,
  modal,
  popover,
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

  it("should be able to manage collection authority level", () => {
    cy.signInAsAdmin();
    cy.visit("/collection/root");

    // Test can create official collection
    cy.icon("new_folder").click();
    modal().within(() => {
      cy.findByLabelText("Name").type(COLLECTION_NAME);
      setOfficial();
      cy.button("Create").click();
    });
    openCollection(COLLECTION_NAME);
    cy.findByTestId("official-collection-marker");
    assertSidebarIcon(COLLECTION_NAME, "badge");

    // Test can change official collection to regular
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
    modal().within(() => {
      setOfficial(false);
      cy.button("Update").click();
    });
    cy.findByTestId("official-collection-marker").should("not.exist");
    assertSidebarIcon(COLLECTION_NAME, "folder");

    // Test can change regular collection to official
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
    modal().within(() => {
      setOfficial();
      cy.button("Update").click();
    });
    cy.findByTestId("official-collection-marker");
    assertSidebarIcon(COLLECTION_NAME, "badge");
  });

  it("displays official badge throughout the application", () => {
    cy.signInAsAdmin();
    testOfficialBadgePresence();
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

    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
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

    // Testing that collection type field appears
    // once a parent collection is changed to a non-personal collection
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
    modal().within(() => {
      assertNoCollectionTypeInput();
      cy.get(".AdminSelect").click();
    });
    popover().within(() => {
      cy.findByText("First collection").click();
    });
    modal().within(() => {
      cy.findByText(/Collection type/i);
      cy.findByText("Regular");
      cy.findByText("Official");
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
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
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

  // Collections page
  cy.findByTestId("official-collection-marker").should(
    expectBadge ? "exist" : "not.exist",
  );
  assertSidebarIcon(COLLECTION_NAME, expectBadge ? "badge" : "folder");

  // Dashboard Page
  cy.findByText("Official Dashboard").click();
  assertHasCollectionBadge(expectBadge);

  // Question Page
  cy.findByText(COLLECTION_NAME).click();
  cy.findByText("Official Question").click();
  assertHasCollectionBadge(expectBadge);

  // Search
  cy.get(".Nav")
    .findByPlaceholderText("Search…")
    .as("searchBar")
    .type("Official");

  cy.findByTestId("search-results-list").within(() => {
    assertSearchResultBadge(COLLECTION_NAME, {
      expectBadge,
      selector: "h3",
    });
    assertSearchResultBadge("Official Question", { expectBadge });
    assertSearchResultBadge("Official Dashboard", { expectBadge });
  });
}

function openCollection(collectionName) {
  sidebar()
    .findByText(collectionName)
    .click();
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
