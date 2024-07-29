import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  navigationSidebar,
  setTokenFeatures,
  modal,
  restore,
  visitCollection,
  createCollection,
  popover,
  menu,
} from "e2e/support/helpers";

describe("scenarios > collections > clean up", () => {
  beforeEach(() => {
    restore();
  });

  describe("oss", () => {
    // TODO: blocked by having token feature
    it.skip("feature should not be available in OSS");
  });

  describe("action menu", () => {
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
      collectionActions().should("not.exist");

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

  describe("clean up collection modal", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should be able to clean up stale items", () => {
      cy.log("create test data");
      // make a collection to clean up w/
      // - 12 questions: 4 very stale, 4, kinda stale, and keep 4 not stale
      // - 9 questions: 3 very stale, 3, kinda stale, and keep 3 not stale
      // this allows us to have pagination on the modal with all stale content
      // but just few enough items that with filtering we can remove the pagination
      // this also allows some content to not be stale
      createCollection({ name: "Clean up test" })
        .then(({ body: collection }) => collection)
        .as("cleanUpCollection");

      cy.get("@cleanUpCollection")
        .then(({ id }) => bulkCreateQuestions(12, { collection_id: id }))
        .as("question")
        .then(questions => {
          const veryStaleIds = questions.slice(0, 4).map(({ id }) => id);
          const staleIds = questions.slice(5, 9).map(({ id }) => id);
          makeItemsStale(veryStaleIds, "card", "2000-01-01");
          makeItemsStale(staleIds, "card");
        });

      cy.get("@cleanUpCollection")
        .then(({ id }) => bulkCreateDashboards(9, { collection_id: id }))
        .as("dashboards")
        .then(dashboards => {
          const veryStaleIds = dashboards.slice(0, 3).map(({ id }) => id);
          const staleIds = dashboards.slice(4, 7).map(({ id }) => id);
          makeItemsStale(veryStaleIds, "dashboard", "2000-01-01");
          makeItemsStale(staleIds, "dashboard");
        });

      cy.get("@cleanUpCollection").then(collection => {
        visitCollection(collection.id);
        collectionMenu().click();
        popover().within(() => {
          cy.findByText("Clean things up").should("exist").click();
        });
        cy.url().should("include", "cleanup");
      });

      modal()
        .last() // TODO: zero clue why there are two modals appearing
        .within(() => {
          // expect that we only have the same amount of stale items as we'd expect 8 question + 6 dashboards
          cy.findByTestId("cleanup-collection-modal-pagination")
            .findByText("14")
            .should("exist");

          dateFilter().click();
          menu().within(() => {
            cy.findByText("1 year").click();
          });

          cy.findByTestId("cleanup-collection-modal-pagination").should(
            "not.exist",
          );
        });

      // - [/] pagination
      // - [/] filters
      //   - [/] date filter
      //     - [x] expect only very old
      //     - [/] change time filter
      //     - [ ] expect only very old + kinda old
      //   - [ ] recursive filter
      //    - [ ]
      // - [ ] sorting
      //   - [ ] can sort by name
      //   - [ ] can sort by last used at
      // - [ ] selection + move to trash
      //  - [ ] items no long appear in the modal content
      //  - [ ] leave modal + expect url change
      //  - [ ] items no long appear in the collection
    });

    it.skip("show empty and error states correctly");
    // - [ ] go to option for collection with no stale items (but with items)
    // - [ ] should see empty screen
    // - [ ] mock a failed stale items request
    // - [ ] change the filter
    // - [ ] expect failed state
  });
});

// action menu
const collectionActions = () => cy.findByTestId("collection-menu");
const collectionMenu = () => collectionActions().icon("ellipsis");

// clean up modal
// const recursiveFilter = () => "TODO";
const dateFilter = () => cy.findByTestId("cleanup-date-filter");
// const dateFilterOption = () => "TODO";

// trashing
// const moveToTrashAction = () => "TODO";
// const undoMoveToTrashAction = () => "TODO";

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
      name: `Bulk dashbaord ${amount}`,
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
