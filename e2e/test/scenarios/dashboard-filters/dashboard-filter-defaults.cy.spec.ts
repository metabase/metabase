import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  clearFilterWidget,
  createQuestionAndDashboard,
  editDashboard,
  filterWidget,
  popover,
  restore,
  saveDashboard,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const QUESTION: StructuredQuestionDetails = {
  name: "Return input value",
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
  },
};

const FILTER_ONE = {
  name: "Filter One",
  slug: "filter_one",
  id: "904aa8b7",
  type: "string/=",
  sectionId: "string",
  default: undefined,
};

const FILTER_TWO = {
  name: "Filter Two",
  slug: "filter_two",
  id: "904aa8b8",
  type: "string/=",
  sectionId: "string",
  default: "Bar",
};

const DASHBOARD = {
  name: "Filters Dashboard",
  parameters: [FILTER_ONE, FILTER_TWO],
};

describe("scenarios > dashboard > filters > reset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestionAndDashboard({
      questionDetails: QUESTION,
      dashboardDetails: DASHBOARD,
    }).then(({ body: dashboardCard }) => {
      const { card_id, dashboard_id } = dashboardCard;

      cy.editDashboardCard(dashboardCard, {
        parameter_mappings: [
          {
            parameter_id: FILTER_ONE.id,
            card_id,
            target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
          {
            parameter_id: FILTER_TWO.id,
            card_id,
            target: ["dimension", ["field", PRODUCTS.TITLE, null]],
          },
        ],
      });

      visitDashboard(dashboard_id);
    });
  });

  it("should reset a filters value when editing the default", () => {
    cy.log("Default dashboard filter");
    cy.location("search").should("eq", "?filter_one=&filter_two=Bar");

    clearFilterWidget(1);

    cy.location("search").should("eq", "?filter_one=&filter_two=");

    cy.log(
      "Finally, when we remove dashboard filter's default value, the url should reflect that by removing the placeholder",
    );
    editDashboard();

    openFilterOptions("Filter Two");

    sidebar().within(() => {
      cy.findByLabelText("Input box").click();
      clearDefaultFilterValue();
      setDefaultFilterValue("Foo");
    });

    popover().button("Add filter").click();

    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");

    saveDashboard();

    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");

    filterWidget().contains("Filter One").should("be.visible");
    filterWidget().contains("Foo").should("be.visible");

    editDashboard();

    openFilterOptions("Filter One");

    sidebar().within(() => {
      cy.findByLabelText("Input box").click();
      setDefaultFilterValue("Quu");
    });

    popover().button("Add filter").click();

    cy.location("search").should("eq", "?filter_one=Quu&filter_two=Foo");

    saveDashboard();

    cy.location("search").should("eq", "?filter_one=Quu&filter_two=Foo");
    filterWidget().contains("Quu").should("be.visible");
    filterWidget().contains("Foo").should("be.visible");
  });
});

function openFilterOptions(name: string) {
  cy.findByText(name).parent().icon("gear").click();
}

function clearDefaultFilterValue() {
  cy.findByLabelText("No default").parent().icon("close").click();
}

function setDefaultFilterValue(value: string) {
  cy.findByLabelText("No default").type(value);
}
