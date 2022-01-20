import _ from "underscore";
import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > collection items listing", () => {
  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;

  describe("pagination", () => {
    const ADDED_QUESTIONS = 15;
    const ADDED_DASHBOARDS = 14;

    const TOTAL_ITEMS = ADDED_DASHBOARDS + ADDED_QUESTIONS;

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      // Removes questions and dashboards included in a default dataset,
      // so the test won't fail if we change the default dataset
      cy.request("GET", "/api/collection/root/items").then(response => {
        response.body.data.forEach(({ model, id }) => {
          if (model !== "collection") {
            cy.request("PUT", `/api/${model}/${id}`, {
              archived: true,
            });
          }
        });
      });

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
      cy.visit("/collection/root");

      // First page
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);

      cy.findByTestId("next-page-btn").click();

      // Second page
      cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should(
        "have.length",
        TOTAL_ITEMS - PAGE_SIZE,
      );
      cy.findByTestId("next-page-btn").should("be.disabled");

      cy.findByTestId("previous-page-btn").click();

      // First page
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    });
  });

  describe("sorting", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      // Removes questions and dashboards included in a default dataset,
      // so it's easier to test sorting
      cy.request("GET", "/api/collection/root/items").then(response => {
        response.body.data.forEach(({ model, id }) => {
          if (model !== "collection") {
            cy.request("PUT", `/api/${model}/${id}`, {
              archived: true,
            });
          }
        });
      });
    });

    it("should allow to sort unpinned items by columns asc and desc", () => {
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

      cy.visit("/collection/root");

      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        expect(actualNames, "sorted alphabetically by default").to.deep.equal(
          sortedNames,
        );
      });

      toggleSortingFor(/Name/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        expect(actualNames, "sorted alphabetically reversed").to.deep.equal(
          sortedNames.reverse(),
        );
      });

      toggleSortingFor(/Name/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        expect(actualNames, "sorted alphabetically").to.deep.equal(sortedNames);
      });

      toggleSortingFor(/Type/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        const dashboardsFirst = _.sortBy(sortedNames, name =>
          name.toLowerCase().includes("question"),
        );
        expect(actualNames, "sorted dashboards first").to.deep.equal(
          dashboardsFirst,
        );
      });

      toggleSortingFor(/Type/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        const questionsFirst = _.sortBy(sortedNames, name =>
          name.toLowerCase().includes("dashboard"),
        );
        expect(actualNames, "sorted questions first").to.deep.equal(
          questionsFirst,
        );
      });

      const lastEditedByColumnTestId = "collection-entry-last-edited-by";

      toggleSortingFor(/Last edited by/i);
      cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
        const actualNames = _.map(nodes, "innerText");
        const sortedNames = _.sortBy(actualNames);
        expect(
          actualNames,
          "sorted by last editor name alphabetically",
        ).to.deep.equal(sortedNames);
      });

      toggleSortingFor(/Last edited by/i);
      cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
        const actualNames = _.map(nodes, "innerText");
        const sortedNames = _.sortBy(actualNames);
        expect(
          actualNames,
          "sorted by last editor name alphabetically reversed",
        ).to.deep.equal(sortedNames.reverse());
      });

      toggleSortingFor(/Last edited at/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        expect(actualNames, "sorted newest last").to.deep.equal(sortedNames);
      });

      toggleSortingFor(/Last edited at/i);
      getAllCollectionItemNames().then(({ actualNames, sortedNames }) => {
        expect(actualNames, "sorted newest first").to.deep.equal(
          sortedNames.reverse(),
        );
      });
    });

    it("should reset pagination if sorting applied on not first page", () => {
      _.times(15, i => cy.createDashboard(`dashboard ${i}`));
      _.times(15, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        }),
      );

      cy.visit("/collection/root");

      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("next-page-btn").click();

      toggleSortingFor(/Last edited at/i);

      cy.findByText(`1 - ${PAGE_SIZE}`);
    });
  });
});

function toggleSortingFor(columnName) {
  const testId = "items-table-head";
  cy.findByTestId(testId)
    .findByText(columnName)
    .click();
}

function getAllCollectionItemNames() {
  const testId = "collection-entry-name";
  return cy.findAllByTestId(testId).then(nodes => {
    const actualNames = _.map(nodes, "innerText");
    const sortedNames = _.sortBy(actualNames);
    return { actualNames, sortedNames };
  });
}
