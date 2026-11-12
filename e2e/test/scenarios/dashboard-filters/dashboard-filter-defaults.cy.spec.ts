const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reset a filters value when editing the default, and leave other filters alone", () => {
    H.createQuestionAndDashboard({
      questionDetails: QUESTION,
      dashboardDetails: DASHBOARD,
    }).then(({ body: dashboardCard }) => {
      const { card_id, dashboard_id } = dashboardCard;

      H.editDashboardCard(dashboardCard, {
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
      }).then(() => {
        H.visitDashboard(dashboard_id, {
          params: {
            filter_one: "",
            filter_two: "Bar",
          },
        });
      });
    });

    cy.log("Default dashboard filter");

    H.filterWidget().contains("Filter One").should("be.visible");
    H.filterWidget().contains("Bar").should("be.visible");

    cy.location("search").should("eq", "?filter_one=&filter_two=Bar");

    H.clearFilterWidget(1);

    cy.location("search").should("eq", "?filter_one=&filter_two=");

    cy.log("Replacing Filter Two's default value updates its value in the url");
    H.editDashboard();

    H.filterWidget({ name: "Filter Two", isEditing: true }).click();

    H.sidebar().within(() => {
      cy.findByLabelText("Input box").click();
      clearDefaultFilterValue();
    });

    setDefaultFilterValue("Foo");

    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");

    H.saveDashboard();

    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");

    H.filterWidget().contains("Filter One").should("be.visible");
    H.filterWidget().contains("Foo").should("be.visible");

    cy.log(
      "Setting Filter One's default value leaves Filter Two's value alone",
    );
    H.editDashboard();

    H.filterWidget({ name: "Filter One", isEditing: true }).click();

    H.sidebar().within(() => {
      cy.findByLabelText("Input box").click();
    });

    setDefaultFilterValue("Baz");

    cy.location("search").should("eq", "?filter_one=Baz&filter_two=Foo");

    H.saveDashboard();

    cy.location("search").should("eq", "?filter_one=Baz&filter_two=Foo");

    H.filterWidget().contains("Baz").should("be.visible");
    H.filterWidget().contains("Foo").should("be.visible");

    cy.log("Keep a long value inside the filter box (metabase#59306)");
    H.clearFilterWidget(0);
    H.filterWidget({ name: "Filter One" }).click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text")
        .type("asdf".repeat(20))
        .invoke("outerWidth")
        .should("be.lt", 400);
    });
  });
});

function clearDefaultFilterValue() {
  cy.findByLabelText("No default").parent().icon("close").click();
}

function setDefaultFilterValue(value: string) {
  H.sidebar().within(() => {
    cy.findByLabelText("No default").click();
  });
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter some text").type(value);
    cy.button("Add filter").click();
  });
}
