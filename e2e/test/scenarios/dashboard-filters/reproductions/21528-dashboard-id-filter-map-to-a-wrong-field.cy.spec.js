import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  appBar,
  dashboardParametersContainer,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const NATIVE_QUESTION_DETAILS = {
  name: "Orders with Product ID filter",
  native: {
    query: "select * from ORDERS where {{product_id}}",
    "template-tags": {
      product_id: {
        type: "dimension",
        name: "product_id",
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        "display-name": "Product ID",
        dimension: ["field", ORDERS.PRODUCT_ID, null],
        "widget-type": "id",
      },
    },
  },
  parameters: [
    {
      id: "56708d23-6f01-42b7-98ed-f930295d31b9",
      type: "id",
      target: ["dimension", ["template-tag", "product_id"]],
      name: "Product ID",
      slug: "product_id",
    },
  ],
};

const DASHBOARD_DETAILS = {
  name: "Dashboard with ID filter",
  parameters: [
    {
      id: "9f85cd3d",
      name: "Product ID",
      sectionId: "id",
      slug: "product_id",
      type: "id",
    },
  ],
};

describe("issue 21528", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(NATIVE_QUESTION_DETAILS, {
      wrapId: true,
      idAlias: "questionId",
    });

    cy.log(
      "set Orders.Product_ID `Filtering on this field`: `A list of all values`",
    );
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });

    cy.log("set Orders.Product_ID `Display values`: `Use foreign key > Title`");
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      type: "external",
      name: "Product ID",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createDashboard(DASHBOARD_DETAILS).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      addOrUpdateDashboardCard({
        card_id: this.questionId,
        dashboard_id: this.dashboardId,
        card: {
          parameter_mappings: [
            {
              card_id: this.questionId,
              parameter_id: "9f85cd3d",
              target: ["dimension", ["template-tag", "product_id"]],
            },
          ],
        },
      });
    });
  });

  it("should show dashboard ID filter values when mapped to a native question with a foreign key field filter", () => {
    cy.get("@questionId").then(questionId => {
      cy.visit(`/question/${questionId}`);
    });

    cy.findByTestId("native-query-top-bar").findByText("Product ID").click();
    popover().contains("Rustic Paper Wallet - 1").should("be.visible");

    // Navigating to another page via JavaScript is faster than using `cy.visit("/dashboard/:dashboard-id")` to load the whole page again.
    openNavigationSidebar();
    navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    dashboardParametersContainer().findByText("Product ID").click();
    popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");

    cy.log("The following scenario breaks on 46");
    // Navigating to another page via JavaScript is faster than using `cy.visit("/admin/datamodel")` to load the whole page again.
    appBar().icon("gear").click();
    popover().findByText("Admin settings").click();
    appBar().findByText("Table Metadata").click();
    cy.findByRole("main")
      .findByText(
        "Select any table to see its schema and add or edit metadata.",
      )
      .should("be.visible");
    cy.findByRole("navigation").findByText("Exit admin").click();

    openNavigationSidebar();
    navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    // Assert that the dashboard ID filter values is still showing correctly again.
    dashboardParametersContainer().findByText("Product ID").click();
    popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");
  });
});
