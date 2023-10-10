import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { setQuarterAndYear } from "../../native-filters/helpers/e2e-date-filter-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      "CC Date": ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
    },
    "order-by": [
      ["asc", ["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
    ],
  },
};

const parameters = [
  {
    name: "Quarter and Year",
    slug: "quarter_and_year",
    id: "f8ae0c97",
    type: "date/quarter-year",
    sectionId: "date",
  },
];

const dashboardDetails = { parameters };

describe("issue 17775", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        const updatedSize = { size_x: 21, size_y: 8 };

        cy.editDashboardCard(dashboardCard, updatedSize);

        visitDashboard(dashboard_id);
      },
    );

    editDashboard();

    // Make sure filter can be connected to the custom column using UI, rather than using API.
    cy.get("main header").find(".Icon-gear").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Column to filter on")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });

    popover().within(() => {
      cy.findByText("CC Date").click();
    });

    saveDashboard();
  });

  it("should be able to apply dashboard filter to a custom column (metabase#17775)", () => {
    filterWidget().click();

    setQuarterAndYear({ quarter: "Q1", year: "2023" });

    cy.findAllByText("44.43").should("have.length", 2);
    cy.findAllByText("March 26, 2023, 8:45 AM").should("have.length", 2);
  });
});
