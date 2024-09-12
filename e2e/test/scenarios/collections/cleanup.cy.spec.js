import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createCollection,
  describeEE,
  getCollectionActions,
  main,
  modal,
  navigationSidebar,
  onlyOnOSS,
  popover,
  restore,
  setTokenFeatures,
  undo,
  visitCollection,
} from "e2e/support/helpers";

describe("scenarios > collections > clean up", () => {
  beforeEach(() => {
    restore();
  });

  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      onlyOnOSS();
      cy.signInAsAdmin();
    });

    it("feature should not be available in OSS", () => {
      visitCollection(FIRST_COLLECTION_ID);
      collectionMenu().click();
      popover().within(() => {
        cy.findByText("Clean things up").should("not.exist");
      });
    });
  });

  describeEE("action menu", () => {
    it("should show in proper contexts", () => {
      cy.signInAsAdmin();
      setTokenFeatures("all");

      cy.log("should not show in custom analytics collections");
      visitCollection("root");
      navigationSidebar().within(() => {
        cy.findByText("Metabase analytics").click();
        cy.findByText("Custom reports").click();
      });
      collectionMenu().click();
      popover().within(() => {
        cy.findByText("Clean things up").should("not.exist");
      });

      cy.log(
        "should show in a normal collection that user has write access to",
      );
      visitCollection(FIRST_COLLECTION_ID);
      collectionMenu().click();
      popover().within(() => {
        cy.findByText("Clean things up").should("exist");
      });

      cy.log("should not show in custom analytics collections");
      popover().within(() => {
        cy.findByText("Move to trash").click();
      });
      modal().within(() => {
        cy.findByText("Move to trash").click();
      });
      cy.findByTestId("archive-banner").should("exist");
      getCollectionActions().should("not.exist");

      cy.log("empty collection");
      createCollection({ name: "Empty" }).then(({ body: { id } }) => {
        visitCollection(id);
        collectionMenu().click();
        popover().within(() => {
          cy.findByText("Clean things up").should("not.exist");
        });
      });
    });

    it("should not show to users who do not have write permissions to a collection", () => {
      cy.signIn("readonly");
      visitCollection(FIRST_COLLECTION_ID);
      collectionMenu().should("not.exist");
    });
  });

  describeEE("clean up collection modal", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should be able to clean up stale items", () => {
      seedMainTestData().then(seedData => {
        const firstAlphabeticalName = "Bulk dashboard 1";
        const lastAlphabeticalName = "Bulk question 9";

        cy.log("should be able to navigate to clean up modal");
        visitCollection(seedData.collection.id);
        selectCleanThingsUpCollectionAction();
        cy.url().should("include", "cleanup");

        cy.log("should render all items of current collection");
        assertStaleItemCount(seedData.totalStaleItemCount);

        cy.log("should be able to filter to fewer items");
        setDateFilter("1 year");
        assertNoPagination();

        cy.log("should be able to recursively show stale items");
        setDateFilter("6 months");
        recursiveFilter().click();
        assertStaleItemCount(seedData.recursiveTotalItemCount);

        cy.log("pagination should work as expected");
        pagination().within(() => {
          cy.findByText("1 - 10").should("exist");
        });
        cleanUpModal().within(() => {
          cy.findByText(lastAlphabeticalName).should("not.exist");
        });
        pagination().within(() => {
          cy.findAllByTestId("next-page-btn").click();
          cy.findByText("11 - 19").should("exist");
        });
        cleanUpModal().within(() => {
          cy.findByText(lastAlphabeticalName).should("exist");
        });
        pagination().within(() => {
          cy.findAllByTestId("previous-page-btn").click();
          cy.findByText("1 - 10").should("exist");
          cy.findAllByTestId("next-page-btn").click();
          cy.findByText("11 - 19").should("exist");
        });

        cy.log("pagination should reset when the date filter changes");
        setDateFilter("3 months");
        pagination().within(() => {
          cy.findByText("1 - 10").should("exist");
          cy.findAllByTestId("next-page-btn").click();
          cy.findByText("11 - 19").should("exist");
        });

        // pagination should reset when the recursive filter changes
        recursiveFilter().click();
        pagination().within(() => {
          cy.findByText("1 - 10").should("exist");
        });
        recursiveFilter().click();

        cy.log("should be able to sort items by name and last used at columns");
        cleanUpModal().within(() => {
          cy.get("table").within(() => {
            cy.findByText(firstAlphabeticalName).should("exist");
            cy.findByText(lastAlphabeticalName).should("not.exist");
            cy.findByText(/Name/).click();
            cy.findByText(firstAlphabeticalName).should("not.exist");
            cy.findByText(lastAlphabeticalName).should("exist");
            cy.findByText(/Name/).click();
            cy.findByText(firstAlphabeticalName).should("exist");
            cy.findByText(lastAlphabeticalName).should("not.exist");
          });
        });

        cy.log("should be able to move stale items to the trash");
        recursiveFilter().click();
        assertStaleItemCount(seedData.totalStaleItemCount);

        selectAllItems();
        moveToTrash();
        assertNoPagination();

        undo();
        assertStaleItemCount(seedData.totalStaleItemCount);

        selectAllItems();
        moveToTrash();
        assertNoPagination();

        selectAllItems();
        moveToTrash();

        closeCleanUpModal();
        cy.url().should("not.include", "cleanup");

        cy.log(
          "collection items view should reflect the actions taken in the clean up modal",
        );
        main().within(() => {
          cy.get("tr").should(
            "have.length",
            seedData.notStaleItemCount +
              1 + // child collection
              1, // header row
          );
        });
      });
    });

    it("show empty and error states correctly", () => {
      cy.log("should handle empty state");
      cy.intercept("GET", "/api/ee/stale/**?**").as("stale-items");

      // visit collection w/ items but no stale items
      createCollection({ name: "Not empty w/ not stale items" })
        .then(({ body: { id } }) => id)
        .as("collectionId");

      cy.get("@collectionId").then(id => {
        return bulkCreateQuestions(2, { collection_id: id }).then(() => {
          visitCollection(id);
        });
      });

      cy.log("should render a table w/ contents");
      main().within(() => {
        cy.findByText("Type");
        cy.findByText("Name");
      });

      selectCleanThingsUpCollectionAction();

      cy.wait("@stale-items");

      cleanUpModal().within(() => {
        emptyState().should("exist");
      });

      cy.log("should handle error state");
      cy.intercept("GET", "/api/ee/stale/**?**", {
        statusCode: 500,
      }).as("stale-items");

      setDateFilter("1 year");
      cy.wait("@stale-items");
      errorState().should("exist");
    });
  });
});

// elements
const collectionMenu = () => getCollectionActions().icon("ellipsis");
const cleanUpModal = () => cy.findAllByTestId("cleanup-collection-modal");
const closeCleanUpModal = () =>
  cy.findAllByTestId("cleanup-collection-modal-close-btn").click();
const recursiveFilter = () =>
  cy.findByText(/Include items in sub-collections/).should("exist");
const dateFilter = () => cy.findByTestId("cleanup-date-filter");
const pagination = () => cy.findByTestId("cleanup-collection-modal-pagination");
const emptyState = () => cy.findByText(/All items have been used in the past/);
const errorState = () => cy.findByText(/An error occurred/);

// actions
const selectCleanThingsUpCollectionAction = () => {
  getCollectionActions().should("exist");
  collectionMenu().should("exist").click();
  popover()
    .should("exist")
    .within(() => {
      cy.findByText("Clean things up").click();
    });
};
const setDateFilter = timeSpan => {
  dateFilter().click();
  popover().within(() => {
    cy.findByText(timeSpan).click();
  });
};

const selectAllItems = () => {
  cleanUpModal().within(() => {
    cy.findAllByTestId("clean-up-table-check").click({ multiple: true });
  });
};

const moveToTrash = () => {
  cy.findByTestId("toast-card")
    .should("be.visible")
    .within(() => {
      cy.findByText("Move to trash").should("exist").click();
    });
};

// assertions
const assertNoPagination = () => {
  cleanUpModal().within(() => {
    pagination().should("not.exist");
  });
};

const assertStaleItemCount = itemCount => {
  cleanUpModal().within(() => {
    cy.findAllByTestId("pagination-total").should("have.text", `${itemCount}`);
  });
};

// seed data helpers
const bulkCreateQuestions = (amount, options, results = []) => {
  return cy
    .createQuestion({
      name: `Bulk question ${amount}`,
      query: { "source-table": STATIC_ORDERS_ID },
      type: "model",
      ...options,
    })
    .then(req => {
      results.push(req.body);
      if (amount <= 1) {
        return results;
      }
      return bulkCreateQuestions(amount - 1, options, results);
    });
};

const bulkCreateDashboards = (amount, options, results = []) => {
  return cy
    .createDashboard({
      name: `Bulk dashboard ${amount}`,
      ...options,
    })
    .then(req => {
      results.push(req.body);
      if (amount <= 1) {
        return results;
      }
      return bulkCreateDashboards(amount - 1, options, results);
    });
};

function makeItemStale(
  id, // any
  model, // "card" | "dashboard"
  dateString, // optional "YYYY-MM-DD" date to set it last used at time for the entity
) {
  return cy.request("POST", "/api/testing/mark-stale", {
    id,
    model,
    ...(dateString ? { "date-str": dateString } : {}),
  });
}

function makeItemsStale(
  ids, // any[]
  model, // "card" | "dashboard"
  dateString, // "YYYY-MM-DD" date to set it last used at time for the entity
) {
  return makeItemStale(ids[0], model, dateString).then(() => {
    if (ids.length > 1) {
      return makeItemsStale(ids.slice(1), model, dateString);
    }
  });
}

function seedMainTestData() {
  let collection = null;

  const notStaleQuestionIds = [];
  const veryStaleQuestionIds = [];
  const staleQuestionIds = [];
  const notStaleDashboardIds = [];
  const veryStaleDashboardIds = [];
  const staleDashboardIds = [];

  const veryStaleChildDashboardIds = [];

  // make a collection to clean up w/
  // - 12 questions: 4 very stale, 4, kinda stale, and keep 4 not stale
  // - 9 questions: 3 very stale, 3, kinda stale, and keep 3 not stale
  // this allows us to have pagination on the modal with all stale content
  // but just few enough items that with filtering we can remove the pagination
  // this also allows some content to not be stale
  //
  // also create a child collection with a few stale items so that we can test for
  // the recursive filter
  createCollection({ name: "Clean up test" })
    .then(({ body }) => {
      collection = body;
      return body;
    })
    .as("cleanUpCollection");

  cy.get("@cleanUpCollection")
    .then(({ id }) => bulkCreateQuestions(12, { collection_id: id }))
    .as("questions")
    .then(questions => {
      veryStaleQuestionIds.push(...questions.slice(0, 4).map(({ id }) => id));
      staleQuestionIds.push(...questions.slice(4, 8).map(({ id }) => id));
      notStaleQuestionIds.push(...questions.slice(8).map(({ id }) => id));
      makeItemsStale(veryStaleQuestionIds, "card", "2000-01-01");
      makeItemsStale(staleQuestionIds, "card");
      cy.log("TESTING");
    });

  cy.get("@cleanUpCollection")
    .then(({ id }) => bulkCreateDashboards(9, { collection_id: id }))
    .as("dashboards")
    .then(dashboards => {
      veryStaleDashboardIds.push(...dashboards.slice(0, 3).map(({ id }) => id));
      staleDashboardIds.push(...dashboards.slice(3, 6).map(({ id }) => id));
      notStaleDashboardIds.push(...dashboards.slice(6).map(({ id }) => id));
      makeItemsStale(veryStaleDashboardIds, "dashboard", "2000-01-01");
      makeItemsStale(staleDashboardIds, "dashboard");
    });

  cy.get("@cleanUpCollection").then(({ id }) => {
    createCollection({ name: "Child clean up test", parent_id: id })
      .then(({ body: collection }) => collection)
      .as("cleanUpChildCollection");
  });

  cy.get("@cleanUpChildCollection")
    .then(({ id }) => bulkCreateDashboards(5, { collection_id: id }))
    .as("childDashboards")
    .then(dashboards => {
      veryStaleChildDashboardIds.push(...dashboards.map(({ id }) => id));
      makeItemsStale(veryStaleChildDashboardIds, "dashboard", "2000-01-01");
    });

  return cy.get("@childDashboards").then(() => {
    const veryStaleItemCount =
      veryStaleQuestionIds.length + veryStaleDashboardIds.length;
    const staleItemCount = staleQuestionIds.length + staleDashboardIds.length;
    const notStaleItemCount =
      notStaleQuestionIds.length + notStaleDashboardIds.length;
    const totalStaleItemCount = veryStaleItemCount + staleItemCount;
    const recursiveTotalItemCount =
      veryStaleItemCount + staleItemCount + veryStaleChildDashboardIds.length;

    return {
      collection,
      notStaleItemCount,
      totalStaleItemCount,
      recursiveTotalItemCount,
    };
  });
}
