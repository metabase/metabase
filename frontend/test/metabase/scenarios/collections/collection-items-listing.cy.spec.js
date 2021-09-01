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

      _.times(ADDED_DASHBOARDS, i => cy.createDashboard(`dashboard ${i}`));
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

    [true, false].forEach(pinned => {
      const testName = pinned
        ? "should allow to sort pinned items by columns asc and desc"
        : "should allow to sort items by columns asc and desc";

      it(testName, () => {
        ["A", "B", "C"].forEach((letter, i) => {
          cy.createDashboard(`${letter} Dashboard`, {
            collection_position: pinned ? i + 1 : null,
          });

          // Signing in as a different users, so we have different names in "Last edited by"
          // In that way we can test sorting by this column correctly
          cy.signIn("normal");

          cy.createQuestion({
            name: `${letter} Question`,
            collection_position: pinned ? i + 1 : null,
            query: TEST_QUESTION_QUERY,
          });
        });

        cy.visit("/collection/root");

        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            expect(
              actualNames,
              "sorted alphabetically by default",
            ).to.deep.equal(sortedNames);
          },
        );

        toggleSortingFor(/Name/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            expect(actualNames, "sorted alphabetically reversed").to.deep.equal(
              sortedNames.reverse(),
            );
          },
        );

        toggleSortingFor(/Name/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            expect(actualNames, "sorted alphabetically").to.deep.equal(
              sortedNames,
            );
          },
        );

        toggleSortingFor(/Type/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            const dashboardsFirst = _.sortBy(sortedNames, name =>
              name.toLowerCase().includes("question"),
            );
            expect(actualNames, "sorted dashboards first").to.deep.equal(
              dashboardsFirst,
            );
          },
        );

        toggleSortingFor(/Type/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            const questionsFirst = _.sortBy(sortedNames, name =>
              name.toLowerCase().includes("dashboard"),
            );
            expect(actualNames, "sorted questions first").to.deep.equal(
              questionsFirst,
            );
          },
        );

        const lastEditedByColumnTestId = pinned
          ? "pinned-collection-entry-last-edited-by"
          : "collection-entry-last-edited-by";

        toggleSortingFor(/Last edited by/i, { pinned });
        cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
          const actualNames = _.map(nodes, "innerText");
          const sortedNames = _.sortBy(actualNames);
          expect(
            actualNames,
            "sorted by last editor name alphabetically",
          ).to.deep.equal(sortedNames);
        });

        toggleSortingFor(/Last edited by/i, { pinned });
        cy.findAllByTestId(lastEditedByColumnTestId).then(nodes => {
          const actualNames = _.map(nodes, "innerText");
          const sortedNames = _.sortBy(actualNames);
          expect(
            actualNames,
            "sorted by last editor name alphabetically reversed",
          ).to.deep.equal(sortedNames.reverse());
        });

        toggleSortingFor(/Last edited at/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            expect(actualNames, "sorted newest last").to.deep.equal(
              sortedNames,
            );
          },
        );

        toggleSortingFor(/Last edited at/i, { pinned });
        getAllCollectionItemNames({ pinned }).then(
          ({ actualNames, sortedNames }) => {
            expect(actualNames, "sorted newest first").to.deep.equal(
              sortedNames.reverse(),
            );
          },
        );
      });
    });

    it("should allow to separately sort pinned and not pinned items", () => {
      ["A", "B", "C"].forEach((letter, i) => {
        cy.createDashboard(`${letter} Dashboard`);

        cy.createDashboard(`${letter} Dashboard (pinned)`, {
          collection_position: i + 1,
        });

        cy.createQuestion({
          name: `${letter} Question`,
          collection_position: null,
          query: TEST_QUESTION_QUERY,
        });

        cy.createQuestion({
          name: `${letter} Question (pinned)`,
          collection_position: i + 1,
          query: TEST_QUESTION_QUERY,
        });
      });

      cy.visit("/collection/root");

      toggleSortingFor(/Type/i, { pinned: true });
      toggleSortingFor(/Name/, { pinned: false });

      getAllCollectionItemNames({ pinned: true }).then(
        ({ actualNames, sortedNames }) => {
          const dashboardsFirst = _.sortBy(sortedNames, name =>
            name.toLowerCase().includes("question"),
          );
          expect(actualNames, "sorted dashboards first").to.deep.equal(
            dashboardsFirst,
          );
        },
      );

      getAllCollectionItemNames({ pinned: false }).then(
        ({ actualNames, sortedNames }) => {
          expect(actualNames, "sorted alphabetically reversed").to.deep.equal(
            sortedNames.reverse(),
          );
        },
      );
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

function toggleSortingFor(columnName, { pinned = false } = {}) {
  const testId = pinned ? "pinned-items-table-head" : "items-table-head";
  cy.findByTestId(testId)
    .findByText(columnName)
    .click();
}

function getAllCollectionItemNames({ pinned = false } = {}) {
  const testId = pinned
    ? "pinned-collection-entry-name"
    : "collection-entry-name";
  return cy.findAllByTestId(testId).then(nodes => {
    const actualNames = _.map(nodes, "innerText");
    const sortedNames = _.sortBy(actualNames);
    return { actualNames, sortedNames };
  });
}
