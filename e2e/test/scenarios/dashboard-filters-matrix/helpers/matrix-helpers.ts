import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { ValuesQueryType } from "metabase-types/api";

import { matrix } from "./matrix";

export type TestCase = {
  arity: "single" | "multi";
  type: "search" | "dropdown" | "plain";
  adminType: "search" | "list" | "plain";
  operator: "Is" | "Contains";
  source: "connected" | "card" | "custom";
  results: "large" | "small";
  component: "token-field" | "list-field" | "single-select-list-field";
};

// there are 216 test cases so we need 11 spec files
const PER_PAGE = 20;

export function runPage(pageNumber: number) {
  runAll(page(pageNumber));
}

export function page(number: number): TestCase[] {
  const start = number * PER_PAGE;
  const end = start + PER_PAGE;
  return matrix.slice(start, end);
}

export function runAll(cases: TestCase[]) {
  cases.forEach(run);
}

export function run(test: TestCase) {
  it(`a parameter (${filterName(test)}) where the admin field setting is ${test.adminType} should render ${test.component}`, () => {
    H.restore();
    cy.signInAsAdmin();

    setup(test);

    openParameterWidget(test);
    cy.findByTestId("loading-indicator").should("not.exist");

    checkComponent(test);
  });
}

function filterName(test: TestCase) {
  return `${test.arity} ${test.type} ${test.adminType} ${test.results} ${test.operator} ${test.source}`;
}

function queryType(
  type: "search" | "dropdown" | "list" | "plain",
): ValuesQueryType {
  switch (type) {
    case "search":
      return "search";
    case "dropdown":
    case "list":
      return "list";
    case "plain":
      return "none";
  }
}

const { PEOPLE, PEOPLE_ID, ACCOUNTS, ACCOUNTS_ID } = SAMPLE_DATABASE;

function parameterSource(test: TestCase, otherCardId: number) {
  if (test.source === "connected") {
    return {};
  }
  if (test.source === "card") {
    return {
      values_source_type: "card" as const,
      values_source_config: {
        card_id: otherCardId,
        value_field: ["field", ACCOUNTS.FIRST_NAME, null],
      },
    };
  }
  if (test.source === "custom") {
    const count = test.results === "large" ? 1050 : 5;
    return {
      values_source_type: "static-list" as const,
      values_source_config: {
        values: new Array(count).fill(0).map((_, i) => `Value ${i}`),
      },
    };
  }
  return {};
}

function setup(test: TestCase) {
  const column = test.results === "large" ? PEOPLE.NAME : PEOPLE.SOURCE;

  // TODO: set the values source and source type

  // Set field admin setting
  cy.request("PUT", `/api/field/${column}`, {
    has_field_values: queryType(test.adminType),
  });

  H.createQuestion({
    name: "Accounts Question",
    query: { "source-table": ACCOUNTS_ID },
  }).then(({ body: { id: otherCardId } }) => {
    const question = {
      name: "People Question",
      query: { "source-table": PEOPLE_ID },
      collection: "Our Analytics",
    };

    const type = test.operator === "Is" ? "string/=" : "string/contains";

    const parameter = {
      id: "5aefc726",
      name: filterName(test),
      slug: "filter",
      type,
      values_query_type: queryType(test.type),
      ...parameterSource(test, otherCardId),
    };

    cy.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [question],
    }).then(({ dashboard, questions: cards }) => {
      const [question] = cards;

      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: question.id,
            parameter_mappings: [
              {
                parameter_id: parameter.id,
                card_id: question.id,
                target: ["dimension", ["field", column, null]],
              },
            ],
          },
        ],
      });

      H.visitDashboard(dashboard.id);

      cy.wrap(dashboard.id).as("dashboardId");
    });
  });
}

function openParameterWidget(test: TestCase) {
  H.filterWidget().contains(filterName(test)).click();
}

function checkComponent(test: TestCase) {
  if (test.component === "token-field") {
    cy.findByTestId("token-field").should("be.visible");
  }
  if (test.component === "list-field") {
    cy.findByTestId("list-field").should("be.visible");
  }
  if (test.component === "single-select-list-field") {
    cy.findByTestId("single-select-list-field").should("be.visible");
  }
}

// function detectComponent(): Cypress.Chainable<string | null> {
//   const validIds = ["token-field", "list-field", "single-select-list-field"];
//   return cy.get("[data-testid]").then(res => {
//     let id: string | null = null;
//     res.each((_, el) => {
//       const testid = el.dataset.testid;
//       if (testid && validIds.includes(testid)) {
//         id = testid;
//       }
//     });
//     return id;
//   });
// }
