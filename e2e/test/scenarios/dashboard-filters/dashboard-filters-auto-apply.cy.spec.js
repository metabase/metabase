import {
  dashboardHeader,
  dashboardParametersContainer,
  describeWithSnowplow,
  editDashboard,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  filterWidget,
  getDashboardCard,
  popover,
  resetSnowplow,
  restore,
  rightSidebar,
  saveDashboard,
  sidebar,
  undoToast,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const FILTER = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const FILTER_WITH_DEFAULT_VALUE = {
  default: ["Gadget"],
  name: "Category with default value",
  slug: "category_with_default_value",
  id: "e2809ab2",
  type: "string/=",
  sectionId: "string",
};

const QUESTION_DETAILS = {
  name: "Products table",
  query: { "source-table": PRODUCTS_ID },
};

function createDashboardDetails({ parameters }) {
  return {
    parameters,
  };
}

const TOAST_TIMEOUT = 20000;

const TOAST_MESSAGE =
  "You can make this dashboard snappier by turning off auto-applying filters.";

describe("scenarios > dashboards > filters > auto apply", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  });

  it("should handle toggling auto applying filters on and off", () => {
    createDashboard();
    openDashboard();
    cy.wait("@cardQuery");

    // changing parameter values by default should reload affected questions
    filterWidget().within(() => {
      cy.findByText(FILTER.name).click();
    });
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
      cy.wait("@cardQuery");
    });
    getDashboardCard().within(() => {
      cy.findByText("Rows 1-5 of 53").should("be.visible");
    });

    // parameter values should be preserved when disabling auto applying filters
    toggleDashboardInfoSidebar();
    rightSidebar().within(() => {
      cy.findByLabelText("Auto-apply filters").click();
      cy.wait("@updateDashboard");
      cy.findByLabelText("Auto-apply filters").should("not.be.checked");
    });
    filterWidget().within(() => {
      cy.findByText("Gadget").should("be.visible");
    });
    getDashboardCard().within(() => {
      cy.findByText("Rows 1-4 of 53").should("be.visible");
    });

    // draft parameter values should be applied manually
    filterWidget().within(() => {
      cy.findByText("Gadget").click();
    });
    popover().within(() => {
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });
    getDashboardCard().within(() => {
      cy.findByText("Rows 1-4 of 53").should("be.visible");
    });
    dashboardParametersContainer().within(() => {
      cy.button("Apply").click();
      cy.wait("@cardQuery");
    });
    getDashboardCard().within(() => {
      cy.findByText("Rows 1-4 of 107").should("be.visible");
    });

    // draft parameter values should be discarded when enabling auto-applying filters
    filterWidget().within(() => {
      cy.findByText("2 selections").click();
    });
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Update filter").click();
    });
    filterWidget().within(() => {
      cy.findByText("Widget").should("be.visible");
    });
    dashboardParametersContainer().within(() => {
      cy.button("Apply").should("be.visible");
    });
    rightSidebar().within(() => {
      cy.findByLabelText("Auto-apply filters").click();
      cy.wait("@updateDashboard");
      cy.findByLabelText("Auto-apply filters").should("be.checked");
    });
    filterWidget().within(() => {
      cy.findByText("2 selections").should("be.visible");
      cy.get("@cardQuery.all").should("have.length", 3);
    });

    // last applied parameter values should be used when disabling auto applying filters,
    // even if previously there were draft parameter values
    rightSidebar().within(() => {
      cy.findByLabelText("Auto-apply filters").click();
      cy.wait("@updateDashboard");
      cy.findByLabelText("Auto-apply filters").should("not.be.checked");
    });
    filterWidget().within(() => {
      cy.findByText("2 selections").should("be.visible");
      cy.get("@cardQuery.all").should("have.length", 3);
    });
  });

  it("should not preserve draft parameter values when editing the dashboard", () => {
    createDashboard({ dashboardDetails: { auto_apply_filters: false } });
    openDashboard();

    filterWidget().within(() => {
      cy.findByText(FILTER.name).click();
    });
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    dashboardParametersContainer().within(() => {
      cy.button("Apply").should("be.visible");
    });

    editDashboard();
    dashboardHeader().within(() => {
      cy.icon("filter").click();
    });
    popover().within(() => {
      cy.findByText("Text or Category").click();
      cy.findByText("Is").click();
    });
    sidebar().within(() => {
      cy.findByDisplayValue("Text").clear().type("Vendor");
    });
    getDashboardCard().within(() => {
      cy.findByText("Select…").click();
    });
    popover().within(() => {
      cy.findByText("Vendor").click();
    });
    saveDashboard();

    dashboardParametersContainer().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText("Vendor").should("be.visible");
      cy.findByText("Gadget").should("not.exist");
      cy.button("Apply").should("not.exist");
    });
  });

  it("should preserve draft parameter values when editing of the dashboard was cancelled", () => {
    createDashboard({ dashboardDetails: { auto_apply_filters: false } });
    openDashboard();

    filterWidget().within(() => {
      cy.findByText(FILTER.name).click();
    });
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    dashboardParametersContainer().within(() => {
      cy.button("Apply").should("be.visible");
    });

    editDashboard();
    dashboardHeader().within(() => {
      cy.button("Cancel").click();
    });
    filterWidget().within(() => {
      cy.findByText("Gadget").should("be.visible");
    });
    dashboardParametersContainer().within(() => {
      cy.button("Apply").should("be.visible");
    });
  });

  describe("parameter with default values", () => {
    beforeEach(() => {
      createDashboard({ parameter: FILTER_WITH_DEFAULT_VALUE });
    });

    it("should handle toggling auto applying filters on and off", () => {
      openDashboard();
      toggleDashboardInfoSidebar();

      getDashboardCard().findByText("Rows 1-4 of 53").should("be.visible");

      // parameter with default value should still be applied after turning auto-apply filter off
      rightSidebar().within(() => {
        cy.findByLabelText("Auto-apply filters").should("be.checked").click();
        cy.wait("@updateDashboard");
        cy.findByLabelText("Auto-apply filters").should("not.be.checked");
      });

      getDashboardCard().findByText("Rows 1-4 of 53").should("be.visible");

      // card result should be updated after manually updating the filter
      filterWidget().icon("close").click();
      dashboardParametersContainer()
        .button("Apply")
        .should("be.visible")
        .click();

      getDashboardCard().findByText("Rows 1-4 of 200").should("be.visible");

      // should not use the default parameter after turning auto-apply filter on again since the parameter was manually updated
      rightSidebar().within(() => {
        cy.findByLabelText("Auto-apply filters")
          .should("not.be.checked")
          .click();
        cy.wait("@updateDashboard");
        cy.findByLabelText("Auto-apply filters").should("be.checked");
      });

      getDashboardCard().findByText("Rows 1-4 of 200").should("be.visible");
    });

    it("should display a toast when a dashboard takes longer than 15s to load even without parameter values (but has parameters with default values)", () => {
      cy.clock();
      openSlowDashboard();

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().within(() => {
        cy.findByText(TOAST_MESSAGE).should("be.visible");
        cy.button("Turn off").click();
        cy.wait("@updateDashboard");
      });

      toggleDashboardInfoSidebar();
      rightSidebar().within(() => {
        cy.findByLabelText("Auto-apply filters").should("not.be.checked");
      });
      // Gadget
      const filterDefaultValue = FILTER_WITH_DEFAULT_VALUE.default[0];
      filterWidget().within(() => {
        cy.findByText(filterDefaultValue).should("be.visible");
      });
      getDashboardCard().within(() => {
        cy.findByText("Rows 1-4 of 53").should("be.visible");
      });
    });

    it("should not display the toast when we clear out parameter default value", () => {
      cy.clock();
      openSlowDashboard({ [FILTER_WITH_DEFAULT_VALUE.slug]: null });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().should("not.exist");
      getDashboardCard().findByText("Rows 1-5 of 200").should("be.visible");
    });
  });

  describe("auto-apply filter toast", () => {
    it("should display a toast when a dashboard takes longer than 15s to load", () => {
      cy.clock();
      createDashboard();
      openSlowDashboard({ [FILTER.slug]: "Gadget" });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().within(() => {
        cy.findByText(TOAST_MESSAGE).should("be.visible");
        cy.button("Turn off").click();
        cy.wait("@updateDashboard");
      });

      toggleDashboardInfoSidebar();
      rightSidebar().within(() => {
        cy.findByLabelText("Auto-apply filters").should("not.be.checked");
      });
      filterWidget().within(() => {
        cy.findByText("Gadget").should("be.visible");
      });
      getDashboardCard().within(() => {
        cy.findByText("Rows 1-4 of 53").should("be.visible");
      });
    });

    it("should display the toast indefinitely unless dismissing manually", () => {
      cy.clock();
      createDashboard();
      openSlowDashboard({ [FILTER.slug]: "Gadget" });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().findByText(TOAST_MESSAGE).should("be.visible");

      cy.tick(100 * TOAST_TIMEOUT);
      undoToast().findByText(TOAST_MESSAGE).should("be.visible");

      undoToast().icon("close").click();
      undoToast().should("not.exist");
    });

    it("should not display the toast when auto applying filters is disabled", () => {
      cy.clock();
      createDashboard({ dashboardDetails: { auto_apply_filters: false } });
      openSlowDashboard({ [FILTER.slug]: "Gadget" });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().should("not.exist");
      filterWidget().within(() => {
        cy.findByText("Gadget").should("be.visible");
      });
      getDashboardCard().within(() => {
        cy.findByText("Rows 1-5 of 53").should("be.visible");
      });
    });

    it("should not display the toast if there are no parameter values", () => {
      cy.clock();
      createDashboard();
      openSlowDashboard();

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().should("not.exist");
    });

    it("should not display the same toast twice for a dashboard", () => {
      cy.clock();
      createDashboard();
      openSlowDashboard({ [FILTER.slug]: "Gadget" });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().within(() => {
        cy.button("Turn off").should("be.visible");
        cy.icon("close").click();
      });
      filterWidget().within(() => {
        cy.findByText("Gadget").click();
      });
      popover().within(() => {
        cy.findByText("Widget").click();
        cy.findByText("Update filter").click();
      });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().should("not.exist");
    });
  });

  describe("no collection curate permission", () => {
    beforeEach(() => {
      createDashboard();
      cy.signIn("readonly");
    });

    it("should not be able to toggle auto-apply filters toggle", () => {
      openDashboard();
      cy.wait("@cardQuery");

      toggleDashboardInfoSidebar();
      rightSidebar().within(() => {
        cy.findByLabelText("Auto-apply filters").should("be.disabled");
      });
    });

    it("should not display a toast even when a dashboard takes longer than 15s to load", () => {
      cy.clock();
      openSlowDashboard({ [FILTER.slug]: "Gadget" });

      cy.tick(TOAST_TIMEOUT);
      cy.wait("@cardQuery");
      undoToast().should("not.exist");
    });
  });

  describe("embeddings", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    describe("public embeds", () => {
      it("should apply filters after clicking the apply button when auto-apply filters is turned off", () => {
        createDashboard({ dashboardDetails: { auto_apply_filters: false } });
        cy.get("@dashboardId").then(dashboardId => {
          visitPublicDashboard(dashboardId);
        });

        dashboardParametersContainer().button("Apply").should("not.exist");
        filterWidget().findByText("Category").click();
        popover().within(() => {
          cy.findByText("Widget").click();
          cy.button("Add filter").click();
        });
        getDashboardCard().findByText("Rows 1-5 of 200").should("be.visible");
        dashboardParametersContainer()
          .button("Apply")
          .should("be.visible")
          .click();
        getDashboardCard().findByText("Rows 1-5 of 54").should("be.visible");
      });

      it("should not show toast", () => {
        createDashboard();
        cy.clock();
        openSlowPublicDashboard({ [FILTER.slug]: "Gadget" });
        filterWidget().findByText("Gadget").should("be.visible");

        cy.tick(TOAST_TIMEOUT);
        cy.wait("@cardQuery");
        undoToast().should("not.exist");
      });
    });

    describe("signed embeds", () => {
      it("should apply filters after clicking the apply button when auto-apply filters is turned off", () => {
        createDashboard({
          dashboardDetails: {
            auto_apply_filters: false,
            enable_embedding: true,
            embedding_params: {
              [FILTER.slug]: "enabled",
            },
          },
        });
        cy.get("@dashboardId").then(dashboardId => {
          const embeddingPayload = {
            resource: { dashboard: dashboardId },
            params: {},
          };
          visitEmbeddedPage(embeddingPayload);
        });

        dashboardParametersContainer().button("Apply").should("not.exist");
        filterWidget().findByText("Category").click();
        popover().within(() => {
          cy.findByText("Widget").click();
          cy.button("Add filter").click();
        });
        getDashboardCard().findByText("Rows 1-5 of 200").should("be.visible");
        dashboardParametersContainer()
          .button("Apply")
          .should("be.visible")
          .click();
        getDashboardCard().findByText("Rows 1-5 of 54").should("be.visible");
      });

      it("should not show toast", () => {
        createDashboard({
          dashboardDetails: {
            enable_embedding: true,
            embedding_params: {
              [FILTER.slug]: "enabled",
            },
          },
        });

        cy.clock();
        openSlowEmbeddingDashboard({ [FILTER.slug]: "Gadget" });
        filterWidget().findByText("Gadget").should("be.visible");

        cy.tick(TOAST_TIMEOUT);
        cy.wait("@cardQuery");
        undoToast().should("not.exist");
      });
    });
  });
});

describeWithSnowplow("scenarios > dashboards > filters > auto apply", () => {
  const NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_DISABLING_AUTO_APPLY_FILTERS = 2;
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when disabling auto-apply filters", () => {
    createDashboard();
    openDashboard();
    cy.wait("@cardQuery");

    toggleDashboardInfoSidebar();
    rightSidebar().within(() => {
      expectGoodSnowplowEvents(
        NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_DISABLING_AUTO_APPLY_FILTERS,
      );
      cy.findByLabelText("Auto-apply filters").click();
      cy.wait("@updateDashboard");
      cy.findByLabelText("Auto-apply filters").should("not.be.checked");
      expectGoodSnowplowEvents(
        NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_DISABLING_AUTO_APPLY_FILTERS + 1,
      );
    });
  });

  it("should not send snowplow events when enabling auto-apply filters", () => {
    createDashboard({ dashboardDetails: { auto_apply_filters: false } });
    openDashboard();
    cy.wait("@cardQuery");

    toggleDashboardInfoSidebar();
    rightSidebar().within(() => {
      expectGoodSnowplowEvents(
        NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_DISABLING_AUTO_APPLY_FILTERS,
      );
      cy.findByLabelText("Auto-apply filters").click();
      cy.wait("@updateDashboard");
      cy.findByLabelText("Auto-apply filters").should("be.checked");
      expectGoodSnowplowEvents(
        NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_DISABLING_AUTO_APPLY_FILTERS,
      );
    });
  });
});

const createDashboard = ({
  dashboardDetails: dashboardOpts = {},
  parameter = FILTER,
} = {}) => {
  const parameters = [parameter];
  cy.createQuestionAndDashboard({
    questionDetails: QUESTION_DETAILS,
    dashboardDetails: {
      ...createDashboardDetails({ parameters }),
      ...dashboardOpts,
    },
  }).then(({ body: card }) => {
    cy.editDashboardCard(card, getParameterMapping(card, parameters));
    cy.wrap(card.dashboard_id).as("dashboardId");
  });
};

const getParameterMapping = ({ card_id }, parameters) => ({
  parameter_mappings: parameters.map(parameter => {
    return {
      card_id,
      parameter_id: parameter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    };
  }),
});

const openDashboard = (params = {}) => {
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then(dashboardId => {
    visitDashboard(dashboardId, { params });
  });
};

const openSlowDashboard = (params = {}) => {
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then(dashboardId => {
    return cy.visit({
      url: `/dashboard/${dashboardId}`,
      qs: params,
    });
  });

  getDashboardCard().should("be.visible");
};

const openSlowPublicDashboard = (params = {}) => {
  cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then(dashboardId => {
    visitPublicDashboard(dashboardId, { params });
  });

  getDashboardCard().should("be.visible");
};

const openSlowEmbeddingDashboard = (params = {}) => {
  cy.intercept("GET", "/api/embed/dashboard/*/dashcard/*/card/*").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then(dashboardId => {
    const embeddingPayload = {
      resource: { dashboard: dashboardId },
      params: {},
    };
    visitEmbeddedPage(embeddingPayload, {
      setFilters: new URLSearchParams(params).toString(),
    });
  });

  getDashboardCard().should("be.visible");
};

function toggleDashboardInfoSidebar() {
  dashboardHeader().icon("info").click();
}
