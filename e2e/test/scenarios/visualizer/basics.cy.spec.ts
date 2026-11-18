const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CREATED_AT,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  createDashboardWithVisualizerDashcards,
} from "e2e/support/test-visualizer-data";

describe("scenarios > visualizer > basics", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/setting/version-info", {});

    cy.signInAsNormalUser();

    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT, {
      idAlias: "ordersCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(ORDERS_COUNT_BY_PRODUCT_CATEGORY, {
      idAlias: "ordersCountByProductCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT, {
      idAlias: "productsCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY, {
      idAlias: "productsCountByCategoryQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.LANDING_PAGE_VIEWS, {
      idAlias: "landingPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.CHECKOUT_PAGE_VIEWS, {
      idAlias: "checkoutPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS, {
      idAlias: "paymentDonePageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(STEP_COLUMN_CARD, {
      idAlias: "stepColumnQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(VIEWS_COLUMN_CARD, {
      idAlias: "viewsColumnQuestionId",
      wrapId: true,
    });
  });

  it("should create and update a dashcard with 'Visualize another way' button", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      H.verticalWell().findByText("Count").should("exist");
      H.horizontalWell().findByText("Created At: Month").should("exist");

      cy.findByDisplayValue("line").should("be.checked");

      cy.button("Add to dashboard").click();
    });

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      cy.button("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("Cre");

      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).click();
      cy.wait("@cardQuery");

      H.assertWellItems({
        vertical: ["Count", "Count (Products by Created At (Month))"],
        horizontal: ["Created At: Month"],
      });

      cy.findByTestId("visualizer-title").clear().type("Renamed chart").blur();
    });

    H.saveDashcardVisualizerModal();

    H.getDashboardCard(1).within(() => {
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    cy.log("The saved dashcard keeps both data sources and its title");
    cy.reload();
    H.assertDashboardCardTitle(1, "Renamed chart");
    H.getDashboardCard(1).within(() => {
      // Legend item and y-axis name
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should(
        "have.length",
        2,
      );
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should(
        "have.length",
        2,
      );
      cy.findByText("Created At: Month").should("exist");
    });
  });

  it("should add the proper tabId to a new card", () => {
    // make an empty dashboard
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    // edit the dashboard
    H.editDashboard();

    // add a new tab
    H.createNewTab();

    // save the dashboard
    H.saveDashboard();

    // edit the dashboard
    H.editDashboard();

    // delete the first tab so it defaults to the second tab
    H.deleteTab("Tab 1");

    // save the dashboard
    H.saveDashboard();

    // edit the dashboard
    H.editDashboard();

    // add a new card to the remaining tab
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
    cy.wait("@cardQuery");
    H.modal().within(() => {
      cy.findByText("Add to dashboard").click({ force: true });
    });

    // save the dashboard
    H.saveDashboard();

    // check that the dashboard saved and the card is in the first tab
    H.getDashboardCard(0).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
    });
  });

  it("should not reload the dashboard when the base card of a multi-series dashcard is broken (metabase#21665)", () => {
    const Q1 = {
      name: "21665 Q1",
      native: { query: "select 1" },
      display: "scalar" as const,
    };

    const Q2 = {
      name: "21665 Q2",
      native: { query: "select 2" },
      display: "scalar" as const,
    };

    H.createNativeQuestion(Q2);
    H.createNativeQuestionAndDashboard({
      questionDetails: Q1,
      dashboardDetails: { name: "21665D" },
    }).then(({ body: { card_id, dashboard_id } }) => {
      cy.wrap(card_id).as("baseQuestionId");
      cy.wrap(dashboard_id).as("dashboardId");
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(Q2.name);
      cy.button("Save").click();
    });
    H.saveDashboard();

    cy.get("@baseQuestionId").then((baseQuestionId) => {
      cy.request("PUT", `/api/card/${baseQuestionId}`, {
        dataset_query: {
          type: "native",
          native: { query: "select order by --" },
          database: SAMPLE_DB_ID,
        },
      });
    });

    // `cy.on` runs when the test is defined, so register it in the command queue to skip the earlier visit
    const windowLoad = cy.spy().as("windowLoad");
    cy.then(() => cy.on("window:before:load", windowLoad));

    H.visitDashboard("@dashboardId");
    H.getDashboardCard(0)
      .findByText(
        "Some columns are missing, this card might not render correctly.",
      )
      .should("be.visible");
    cy.get("@windowLoad").should("have.been.calledOnce");
  });

  describe("public sharing and embedding", () => {
    function ensureVisualizerCardsAreRendered() {
      // Checks a cartesian chart has an axis name
      H.getDashboardCard(0).within(() => {
        H.echartsContainer()
          .findByText(ORDERS_COUNT_BY_CREATED_AT.name)
          .should("be.visible");
      });

      // Checks a funnel has a step name
      H.getDashboardCard(5)
        .findByText("Checkout Page")
        .scrollIntoView()
        .should("be.visible");
    }

    it("visualizer cards should work in public and embedded dashboards", () => {
      cy.signInAsAdmin();
      createDashboardWithVisualizerDashcards();

      cy.log("Visit public dashboard");
      cy.get("@dashboardId")
        .then((dashboardId) => {
          H.createPublicDashboardLink(dashboardId);
        })
        .then(({ body: { uuid } }: any) => {
          cy.visit(`/public/dashboard/${uuid}`);
        });
      ensureVisualizerCardsAreRendered();

      cy.log("Visit embedded dashboard");
      cy.get("@dashboardId").then((dashboardId) => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
        });
      });
      cy.get("@dashboardId").then((dashboard: any) => {
        H.visitEmbeddedPage({
          resource: { dashboard: dashboard },
          params: {},
        });
      });
      ensureVisualizerCardsAreRendered();
    });
  });
});
