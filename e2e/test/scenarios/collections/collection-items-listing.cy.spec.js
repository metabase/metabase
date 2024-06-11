import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > collection items listing", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/collection/root/items?*").as(
      "getCollectionItems",
    );

    restore();
    cy.signInAsAdmin();
  });

  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;

  describe("pagination", () => {
    const SUBCOLLECTIONS = 1;
    const ADDED_QUESTIONS = 15;
    const ADDED_DASHBOARDS = 14;

    const TOTAL_ITEMS = SUBCOLLECTIONS + ADDED_DASHBOARDS + ADDED_QUESTIONS;

    beforeEach(() => {
      // Removes questions and dashboards included in the default database,
      // so the test won't fail if we change the default database
      archiveAll();

      _.times(ADDED_DASHBOARDS, i =>
        cy.createDashboard({ name: `dashboard ${i}` }),
      );
      _.times(ADDED_QUESTIONS, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        }),
      );
    });

    it("should allow to navigate back and forth", () => {
      visitRootCollection();

      // First page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);

      cy.findByLabelText("Next page").click();
      cy.wait("@getCollectionItems");

      // Second page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should(
        "have.length",
        TOTAL_ITEMS - PAGE_SIZE,
      );
      cy.findByLabelText("Next page").should("be.disabled");

      cy.findByLabelText("Previous page").click();

      // First page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    });
  });

  describe("sorting", () => {
    beforeEach(() => {
      // Removes questions and dashboards included in a default dataset,
      // so it's easier to test sorting
      archiveAll();
    });

    it(
      "should allow to sort unpinned items by columns asc and desc",
      { tags: "@flaky" },
      () => {
        ["A", "B", "C"].forEach((letter, i) => {
          cy.createDashboard({
            name: `${letter} Dashboard`,
            collection_position: null,
          });

          // Signing in as a different users, so we have different names in "Last edited by"
          // In that way we can test sorting by this column correctly
          cy.signIn("normal");

          cy.createQuestion({
            name: `${letter} Question`,
            collection_position: null,
            query: TEST_QUESTION_QUERY,
          });
        });

        visitRootCollection();
        // We're waiting for the loading spinner to disappear from the main sidebar.
        // Otherwise, this causes the page re-render and the flaky test.
        cy.findByTestId("main-navbar-root").get("circle").should("not.exist");

        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          expect(actualNames, "sorted alphabetically by default").to.deep.equal(
            sortedNames,
          );
        });

        toggleSortingFor(/Name/i);
        cy.wait("@getCollectionItems");

        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          expect(actualNames, "sorted alphabetically reversed").to.deep.equal(
            sortedNames.reverse(),
          );
        });

        toggleSortingFor(/Name/i);
        // Not sure why the same XHR doesn't happen after we click the "Name" sorting again?
        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          expect(actualNames, "sorted alphabetically").to.deep.equal(
            sortedNames,
          );
        });

        toggleSortingFor(/Type/i);
        cy.wait("@getCollectionItems");
        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          const dashboardsFirst = _.chain(sortedNames)
            .sortBy(name => name.toLowerCase().includes("question"))
            .sortBy(name => name.toLowerCase().includes("collection"))
            .sortBy(name => name.toLowerCase().includes("metabase analytics"))
            .value();
          expect(actualNames, "sorted dashboards first").to.deep.equal(
            dashboardsFirst,
          );
        });

        toggleSortingFor(/Type/i);
        cy.wait("@getCollectionItems");
        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          const questionsFirst = _.chain(sortedNames)
            .sortBy(name => name.toLowerCase().includes("question"))
            .sortBy(name => name.toLowerCase().includes("dashboard"))
            .value();
          expect(actualNames, "sorted questions first").to.deep.equal(
            questionsFirst,
          );
        });

        const lastEditedByColumnTestId = "collection-entry-last-edited-by";

        toggleSortingFor(/Last edited by/i);
        cy.wait("@getCollectionItems");

        cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
          const actualNames = _.map(nodes, "innerText");
          const sortedNames = _.chain(actualNames)
            .sortBy(actualNames)
            .sortBy(name => !name)
            .value();
          expect(
            actualNames,
            "sorted by last editor name alphabetically",
          ).to.deep.equal(sortedNames);
        });

        toggleSortingFor(/Last edited by/i);
        cy.wait("@getCollectionItems");

        cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
          const actualNames = _.map(nodes, "innerText");
          const sortedNames = _.sortBy(actualNames);
          expect(
            actualNames,
            "sorted by last editor name alphabetically reversed",
          ).to.deep.equal(sortedNames.reverse());
        });

        toggleSortingFor(/Last edited at/i);
        cy.wait("@getCollectionItems");

        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          expect(actualNames, "sorted newest last").to.deep.equal(sortedNames);
        });

        toggleSortingFor(/Last edited at/i);
        cy.wait("@getCollectionItems");

        getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
          const newestFirst = _.chain(sortedNames)
            .reverse()
            .sortBy(name => name.toLowerCase().includes("collection"))
            .sortBy(name => name.toLowerCase().includes("personal"))
            .sortBy(name => name.toLowerCase().includes("metabase analytics"))
            .value();
          expect(actualNames, "sorted newest first").to.deep.equal(newestFirst);
        });
      },
    );

    it("should reset pagination if sorting applied on not first page", () => {
      _.times(15, i => cy.createDashboard(`dashboard ${i}`));
      _.times(15, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        }),
      );

      visitRootCollection();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);

      cy.findByLabelText("Next page").click();
      cy.wait("@getCollectionItems");

      toggleSortingFor(/Last edited at/i);
      cy.wait("@getCollectionItems");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
    });
  });
});

function toggleSortingFor(columnName) {
  const testId = "items-table-head";
  cy.findByTestId(testId).findByText(columnName).click();
  // These random waits are really discouraged, but I couldn't find a reliable
  // way to prevent the flaky sorting test without it.
  cy.wait(50);
}

function getAllCollectionItemNames() {
  const testId = "collection-entry-name";
  return cy.findAllByTestId(testId).then(nodes => {
    const actualNames = _.map(nodes, "innerText");
    const sortedNames = _.sortBy(actualNames);
    return { actualNames, sortedNames };
  });
}

function visitRootCollection() {
  cy.visit("/collection/root");
  cy.wait(["@getCollectionItems", "@getCollectionItems"]);
}

function archiveAll() {
  cy.request("GET", "/api/collection/root/items").then(response => {
    response.body.data.forEach(({ model, id }) => {
      if (model !== "collection") {
        cy.request(
          "PUT",
          `/api/${model === "dataset" ? "card" : model}/${id}`,
          {
            archived: true,
          },
        );
      }
    });
  });
}
