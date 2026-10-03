const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { ValuesQueryType } from "metabase-types/api";

import { matrix } from "./matrix";

const ADMIN_TYPES = ["search", "list", "plain"] as const;
const RESULTS = ["large", "small"] as const;

export type TestCase = {
  arity: "single" | "multi";
  type: "search" | "dropdown" | "plain";
  adminType: (typeof ADMIN_TYPES)[number];
  operator: "Is" | "Contains";
  source: "connected" | "card" | "custom";
  results: (typeof RESULTS)[number];
  component: "token-field" | "list-field" | "single-select-list-field";
};

type SetupGroup = Pick<TestCase, "adminType" | "results">;

// Cases that share the field's `has_field_values` and mapped column can share one dashboard.
export const SETUP_GROUPS: SetupGroup[] = ADMIN_TYPES.flatMap((adminType) =>
  RESULTS.map((results) => ({ adminType, results })),
);

export function runGroup({ adminType, results }: SetupGroup) {
  const cases = matrix.filter(
    (test) => test.adminType === adminType && test.results === results,
  );

  H.restore();
  cy.signInAsAdmin();

  setup({ adminType, results, cases });

  cases.forEach(checkComponent);
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

function setup({
  adminType,
  results,
  cases,
}: SetupGroup & { cases: TestCase[] }) {
  const column = results === "large" ? PEOPLE.NAME : PEOPLE.SOURCE;

  cy.request("PUT", `/api/field/${column}`, {
    has_field_values: queryType(adminType),
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

    const parameters = cases.map((test, index) => ({
      id: `matrix-${index}`,
      name: filterName(test),
      slug: `filter_${index}`,
      type: test.operator === "Is" ? "string/=" : "string/contains",
      isMultiSelect: test.arity === "multi",
      values_query_type: queryType(test.type),
      ...parameterSource(test, otherCardId),
    }));

    H.createDashboardWithQuestions({
      dashboardDetails: { parameters },
      questions: [question],
    }).then(({ dashboard, questions: cards }) => {
      const [question] = cards;

      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: question.id,
            parameter_mappings: parameters.map((parameter) => ({
              parameter_id: parameter.id,
              card_id: question.id,
              target: ["dimension", ["field", column, null]],
            })),
          },
        ],
      });

      H.visitDashboard(dashboard.id);
    });
  });
}

function checkComponent(test: TestCase) {
  const name = filterName(test);
  cy.log(`${name} should render ${test.component}`);

  H.filterWidget().contains(name).click();
  cy.findByTestId("loading-indicator").should("not.exist");
  H.dashboardParametersPopover()
    .findByTestId(test.component)
    .should("be.visible");

  H.filterWidget().contains(name).click();
  cy.findByTestId("parameter-value-dropdown").should("not.exist");
}
