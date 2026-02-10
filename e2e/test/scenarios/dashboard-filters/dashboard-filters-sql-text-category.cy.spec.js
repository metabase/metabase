const { H } = cy;

import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  DASHBOARD_SQL_TEXT_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-text-category";

describe("scenarios > dashboard > filters > SQL > text/category", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        H.visitQuestion(card_id);

        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      H.popover().contains(filter).click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();

        if (["Is", "Is not"].includes(filter)) {
          cy.log("Wait for the correct popover to appear");
          cy.findByPlaceholderText(/search the list/i).should("be.visible");
        }
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter and when that filter is removed (metabase#20493)", () => {
    H.setFilter("Text or Category", "Is");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Is").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Gizmo");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Rustic Paper Wallet");
    });

    H.clearFilterWidget();

    cy.url().should("not.include", "Gizmo");

    H.filterWidget().click();

    applyFilterByType("Is", "Doohickey", { buttonLabel: "Update filter" });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});

describe("scenarios > dashboard > filters > SQL > text and multiple values", () => {
  const questionDetails = {
    name: "SQL",
    native: {
      query: "SELECT ID, CATEGORY FROM products WHERE CATEGORY IN ({{text}})",
      "template-tags": {
        text: {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          name: "text",
          "display-name": "Text",
          type: "text",
        },
      },
    },
  };

  const parameterDetails = {
    id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
    type: "string/=",
    name: "Text",
    slug: "text",
    isMultiSelect: true,
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      text: "enabled",
    },
  };

  function setFilterAndVerify({ values } = {}) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
    values.forEach((value) => {
      H.getDashboardCard().within(() => {
        cy.findAllByText(value).should("have.length.gte", 1);
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow multiple values for Number variables", () => {
    cy.log("create a dashboard");
    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard }) => {
      cy.wrap(dashcard.dashboard_id).as("dashboardId");
    });

    cy.log("set mapping");
    H.visitDashboard("@dashboardId");
    H.editDashboard();
    cy.findByTestId("fixed-width-filters").findByText("Text").click();
    H.selectDashboardFilter(H.getDashboardCard(), "Text");
    H.sidebar().findByLabelText("Multiple values").click();
    H.saveDashboard();

    cy.log("saved dashboard");
    setFilterAndVerify({ values: ["Gadget", "Widget"] });

    cy.log("public dashboard");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitPublicDashboard(dashboardId),
    );
    setFilterAndVerify({ values: ["Gadget", "Widget"] });

    cy.log("embedded dashboard");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    setFilterAndVerify({ values: ["Gadget", "Widget"] });
  });
});
