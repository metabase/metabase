const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

const variableQuestionDetails = {
  name: "Return input value",
  native: {
    query: "select {{filter}}",
    "template-tags": {
      filter: {
        id: "7182a24e-163a-099c-b085-156f0879aaec",
        name: "filter",
        "display-name": "Filter",
        type: "text",
        required: true,
        default: "Foo",
      },
    },
  },
  display: "scalar",
};

const fieldFilterQuestionDetails = {
  name: "SQL products category, required, 2 selections",
  native: {
    query: "select distinct category from PRODUCTS where {{filter}}",
    "template-tags": {
      filter: {
        id: "e33dc805-6b71-99a5-ee14-128383953986",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "category",
        default: ["Gizmo", "Gadget"],
        required: true,
      },
    },
  },
};

const textFilter = {
  name: "Text",
  slug: "text",
  id: "904aa8b7",
  type: "string/=",
  sectionId: "string",
  default: "Bar",
};

const categoryFilter = {
  name: "Category",
  slug: "category",
  id: "49fcc65c",
  type: "category",
  default: "Widget",
};

const dashboardDetails = {
  name: "Required Filters Dashboard",
  parameters: [textFilter, categoryFilter],
};

describe("scenarios > dashboard > filters > SQL > required", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should respect default filter precedence (dashboard filter, then SQL default) while keeping the url in sync", () => {
    createDashboardWithRequiredFilterCards();

    cy.log("dashboard filter defaults apply");
    cy.location("search").should("eq", "?text=Bar&category=Widget");
    H.getDashboardCard(0).should("contain", "Bar");
    H.getDashboardCard(1)
      .should("contain", "Widget")
      .and("not.contain", "Gizmo");
    cy.findByDisplayValue("Bar").should("be.visible");
    H.filterWidget().eq(1).should("contain", "Widget");

    cy.log("cleared dashboard filters fall back to the SQL defaults");
    H.clearFilterWidget(0);
    H.clearFilterWidget(1);
    cy.location("search").should("eq", "?text=&category=");
    assertSqlDefaultsApplied();
    cy.findByPlaceholderText("Text").should("be.visible");
    H.filterWidget().eq(1).should("contain", "Category");

    cy.log("cleared dashboard filters stay cleared on reload (metabase#13960)");
    cy.reload();
    assertSqlDefaultsApplied();
    cy.location("search").should("eq", "?text=&category=");

    cy.log("dashboard filter defaults apply on a subsequent visit");
    cy.visit("/collection/root");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Required Filters Dashboard").click();
    cy.location("search").should("eq", "?text=Bar&category=Widget");

    cy.log("removing a dashboard filter default clears it in the url");
    H.editDashboard();
    H.filterWidget({ isEditing: true, name: "Text" }).click();
    H.sidebar().within(() => {
      removeDefaultFilterValue("Bar");
    });
    H.saveDashboard();
    cy.location("search").should("eq", "?text=&category=Widget");
  });
});

function createDashboardWithRequiredFilterCards() {
  H.createDashboard(dashboardDetails).then(({ body: { id: dashboard_id } }) => {
    H.createNativeQuestion(variableQuestionDetails).then(
      ({ body: { id: variableCardId } }) => {
        H.createNativeQuestion(fieldFilterQuestionDetails).then(
          ({ body: { id: fieldFilterCardId } }) => {
            H.updateDashboardCards({
              dashboard_id,
              cards: [
                {
                  card_id: variableCardId,
                  parameter_mappings: [
                    {
                      parameter_id: textFilter.id,
                      card_id: variableCardId,
                      target: ["variable", ["template-tag", "filter"]],
                    },
                  ],
                },
                {
                  card_id: fieldFilterCardId,
                  col: 11,
                  parameter_mappings: [
                    {
                      parameter_id: categoryFilter.id,
                      card_id: fieldFilterCardId,
                      target: ["dimension", ["template-tag", "filter"]],
                    },
                  ],
                },
              ],
            });
            H.visitDashboard(dashboard_id);
          },
        );
      },
    );
  });
}

function assertSqlDefaultsApplied() {
  H.getDashboardCard(0).should("contain", "Foo");
  H.getDashboardCard(1)
    .should("contain", "Gizmo")
    .and("contain", "Gadget")
    .and("not.contain", "Widget")
    .and("not.contain", "Doohickey");
}

function removeDefaultFilterValue(value) {
  cy.findByDisplayValue(value).parent().find(".Icon-close").click();
}
