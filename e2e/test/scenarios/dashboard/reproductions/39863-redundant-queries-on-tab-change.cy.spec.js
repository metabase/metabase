import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createDashboardWithTabs,
  goToTab,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { createMockDashboardCard as _createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS } = SAMPLE_DATABASE;

const TAB_1 = { id: 1, name: "Tab 1" };
const TAB_2 = { id: 2, name: "Tab 2" };

const DATE_FILER = {
  id: "2",
  name: "Date filter",
  slug: "filter-date",
  type: "date/all-options",
};

const CREATED_AT_FIELD_REF = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

function createMockDashboardCard(opts) {
  const dashcard = _createMockDashboardCard({
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
    ...opts,
  });
  return _.omit(dashcard, "justAdded");
}

describe("issue 39863", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not rerun queries when switching tabs and there are no parameter changes", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DATE_FILER],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    cy.wait("@dashcardQuery");
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    goToTab(TAB_2.name);
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });
});

function setDateFilter() {
  cy.findByLabelText("Date filter").click();
  popover()
    .findByText(/Last 12 months/i)
    .click();
}
