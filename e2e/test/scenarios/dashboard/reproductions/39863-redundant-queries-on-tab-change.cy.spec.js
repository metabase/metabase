import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createDashboardWithTabs,
  dashboardGrid,
  goToTab,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS } = SAMPLE_DATABASE;

const TAB_1 = { id: 1, name: "Tab 1" };
const TAB_2 = { id: 2, name: "Tab 2" };

const DATE_FILTER = {
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

const COMMON_DASHCARD_INFO = {
  card_id: ORDERS_QUESTION_ID,
  parameter_mappings: [
    {
      parameter_id: DATE_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", CREATED_AT_FIELD_REF],
    },
  ],
  size_x: 10,
  size_y: 4,
};

const ID_FILTER = {
  id: "3",
  name: "ID filter",
  slug: "filter-id",
  type: "id",
};

const USER_ID_FILTER = {
  id: "4",
  name: "User ID filter",
  slug: "filter-user-id",
  type: "id",
};

const PRODUCT_ID_FILTER = {
  id: "5",
  name: "Product ID filter",
  slug: "filter-product-id",
  type: "id",
};

const SUBTOTAL_FILTER = {
  id: "6",
  name: "Subtotal filter",
  slug: "filter-subtotal",
  type: "number/<=",
};

const TOTAL_FILTER = {
  id: "7",
  name: "Total filter",
  slug: "filter-total",
  type: "number/<=",
};

const TAX_FILTER = {
  id: "8",
  name: "Tax filter",
  slug: "filter-tax",
  type: "number/<=",
};

const DISCOUNT_FILTER = {
  id: "9",
  name: "Discount filter",
  slug: "filter-discount",
  type: "number/<=",
};

const QUANTITY_FILTER = {
  id: "10",
  name: "Quantity filter",
  slug: "filter-quantity",
  type: "number/<=",
};

const ID_FIELD_REF = ["field", ORDERS.ID, { "base-type": "type/BigInteger" }];

const USER_ID_FIELD_REF = [
  "field",
  ORDERS.USER_ID,
  { "base-type": "type/BigInteger" },
];

const PRODUCT_ID_FIELD_REF = [
  "field",
  ORDERS.PRODUCT_ID,
  { "base-type": "type/BigInteger" },
];

const SUBTOTAL_FIELD_REF = [
  "field",
  ORDERS.SUBTOTAL,
  { "base-type": "type/Float" },
];

const TOTAL_FIELD_REF = ["field", ORDERS.TOTAL, { "base-type": "type/Float" }];

const TAX_FIELD_REF = ["field", ORDERS.TAX, { "base-type": "type/Float" }];

const DISCOUNT_FIELD_REF = [
  "field",
  ORDERS.DISCOUNT,
  { "base-type": "type/Float" },
];

const QUANTITY_FIELD_REF = [
  "field",
  ORDERS.QUANTITY,
  { "base-type": "type/Number" },
];

const DASHCARD_WITH_9_FILTERS = {
  card_id: ORDERS_QUESTION_ID,
  parameter_mappings: [
    {
      parameter_id: DATE_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", CREATED_AT_FIELD_REF],
    },
    {
      parameter_id: ID_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", ID_FIELD_REF],
    },
    {
      parameter_id: USER_ID_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", USER_ID_FIELD_REF],
    },
    {
      parameter_id: PRODUCT_ID_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", PRODUCT_ID_FIELD_REF],
    },
    {
      parameter_id: SUBTOTAL_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", SUBTOTAL_FIELD_REF],
    },
    {
      parameter_id: TOTAL_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", TOTAL_FIELD_REF],
    },
    {
      parameter_id: TAX_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", TAX_FIELD_REF],
    },
    {
      parameter_id: DISCOUNT_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", DISCOUNT_FIELD_REF],
    },
    {
      parameter_id: QUANTITY_FILTER.id,
      card_id: ORDERS_QUESTION_ID,
      target: ["dimension", QUANTITY_FIELD_REF],
    },
  ],
  size_x: 10,
  size_y: 4,
};

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
      parameters: [DATE_FILTER],
      dashcards: [
        createMockDashboardCard({
          ...COMMON_DASHCARD_INFO,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...COMMON_DASHCARD_INFO,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    goToTab(TAB_2.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });

  it("should not rerun queries just because there are 9 or more attached filters to a dash-card", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [
        DATE_FILTER,
        ID_FILTER,
        USER_ID_FILTER,
        PRODUCT_ID_FILTER,
        SUBTOTAL_FILTER,
        TOTAL_FILTER,
        TAX_FILTER,
        DISCOUNT_FILTER,
        QUANTITY_FILTER,
      ],
      dashcards: [
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    goToTab(TAB_2.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });
});

function setDateFilter() {
  cy.findByLabelText("Date filter").click();
  popover()
    .findByText(/Last 12 months/i)
    .click();
}

function assertNoLoadingSpinners() {
  dashboardGrid().findAllByTestId("loading-spinner").should("have.length", 0);
}
