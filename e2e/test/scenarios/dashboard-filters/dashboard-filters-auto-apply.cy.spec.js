const { H } = cy;
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

const TOAST_TIMEOUT = 16000;

const filterToggleLabel = "Auto-apply filters";

describe(
  "scenarios > dashboards > filters > auto apply",
  { tags: "@slow" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();
      cy.intercept(
        "PUT",
        "/api/dashboard/*",
        cy.spy().as("updateDashboardSpy"),
      ).as("updateDashboard");
    });

    describe("modifying only dashboard", () => {
      it("should handle toggling auto applying filters on and off", () => {
        createDashboard();
        openDashboard();
        cy.wait("@cardQuery");

        cy.log(
          "changing parameter values by default should reload affected questions",
        );
        H.filterWidget().findByText(FILTER.name).click();
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Add filter").click();
          cy.wait("@cardQuery");
        });
        H.assertTableRowsCount(53);

        cy.log(
          "parameter values should be preserved when disabling auto applying filters",
        );
        H.openDashboardSettingsSidebar();
        H.sidesheet().within(() => {
          cy.findByText(filterToggleLabel).click();
          cy.wait("@updateDashboard");
          cy.findByLabelText(filterToggleLabel).should("not.be.checked");
        });
        H.closeDashboardSettingsSidebar();
        H.filterWidget().findByText("Gadget").should("be.visible");
        H.assertTableRowsCount(53);

        cy.log("draft parameter values should be applied manually");
        H.filterWidget().findByText("Gadget").click();
        H.popover().within(() => {
          cy.findByText("Widget").click();
          cy.button("Update filter").click();
        });
        H.assertTableRowsCount(53);
        H.applyFilterToast().findByText("1 filter changed");
        H.applyFilterButton().click();

        cy.wait("@cardQuery");
        H.assertTableRowsCount(107);
        cy.get("@cardQuery.all").should("have.length", 3);

        cy.log(
          "draft parameter values should be applied when enabling auto-applying filters",
        );
        H.filterWidget().findByText("2 selections").click();
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Update filter").click();
        });
        H.filterWidget().findByText("Widget").should("be.visible");
        H.applyFilterButton().should("be.visible");

        H.openDashboardSettingsSidebar();
        H.sidesheet().within(() => {
          cy.findByText(filterToggleLabel).click();
          cy.wait("@updateDashboard");
          cy.findByLabelText(filterToggleLabel).should("be.checked");
        });
        H.closeDashboardSettingsSidebar();

        H.filterWidget().findByText("Widget").should("be.visible");
        H.assertTableRowsCount(54);
        cy.get("@cardQuery.all").should("have.length", 4);

        cy.log(
          "last applied parameter values should be used when disabling auto applying filters, even if previously there were draft parameter values",
        );
        H.filterWidget().findByText("Widget").click();
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Update filter").click();
        });

        H.openDashboardSettingsSidebar();
        H.sidesheet().within(() => {
          cy.findByText(filterToggleLabel).click();
          cy.wait("@updateDashboard");
          cy.findByLabelText(filterToggleLabel).should("not.be.checked");
        });
        H.closeDashboardSettingsSidebar();

        H.filterWidget().findByText("2 selections").should("be.visible");
        cy.get("@cardQuery.all").should("have.length", 5);

        cy.get("@updateDashboardSpy").should("have.callCount", 3);
      });
    });

    it("should not save filter state for dashboard parameter w/o auto-apply enabled", () => {
      createDashboard({ dashboardDetails: { auto_apply_filters: false } });
      openDashboard();

      H.filterWidget().findByText(FILTER.name).click();
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.applyFilterButton().should("be.visible");
      H.applyFilterToast().findByText("1 filter changed");

      cy.log("verify filter value is not saved");

      H.visitDashboard("@dashboardId");
      H.filterWidget().should("not.contain", "Gadget");
    });

    it("should allow resetting unapplied filter state", () => {
      createDashboard({ dashboardDetails: { auto_apply_filters: false } });
      openDashboard();

      H.filterWidget().findByText(FILTER.name).click();
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.applyFilterButton().should("be.visible");
      H.applyFilterToast().findByText("1 filter changed");

      H.cancelFilterButton().click();
      H.applyFilterToast().should("not.exist");

      H.filterWidget().findByText(FILTER.name).click();
      H.popover().within(() => {
        cy.findByText("Gadget").should("not.be.checked");
      });
    });

    describe("modifying dashboard and dashboard cards", () => {
      it("should not preserve draft parameter values when editing the dashboard", () => {
        createDashboard({ dashboardDetails: { auto_apply_filters: false } });
        openDashboard();

        H.filterWidget().findByText(FILTER.name).click();
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Add filter").click();
        });
        H.applyFilterButton().should("be.visible");

        H.editDashboard();

        H.setFilter("Text or Category", "Is");

        H.sidebar().findByDisplayValue("Text").clear().type("Vendor");
        H.getDashboardCard().findByText("Select…").click();
        H.popover().findByText("Vendor").click();
        H.saveDashboard();

        H.dashboardParametersContainer().within(() => {
          cy.findByText("Category").should("be.visible");
          cy.findByText("Vendor").should("be.visible");
          cy.findByText("Gadget").should("not.exist");
        });
        H.applyFilterToast().should("not.exist");

        cy.get("@updateDashboardSpy").should("have.callCount", 1);
      });
    });

    describe("modify nothing", () => {
      it("should preserve draft parameter values when editing of the dashboard was cancelled", () => {
        createDashboard({ dashboardDetails: { auto_apply_filters: false } });
        openDashboard();

        H.filterWidget().findByText(FILTER.name).click();
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Add filter").click();
        });
        H.applyFilterButton().should("be.visible");

        H.editDashboard();
        cy.findByTestId("edit-bar").button("Cancel").click();
        H.filterWidget().findByText("Gadget").should("be.visible");
        H.applyFilterButton().should("be.visible");
      });
    });

    describe("parameter with default values", () => {
      beforeEach(() => {
        createDashboard({ parameter: FILTER_WITH_DEFAULT_VALUE });
      });

      it("should handle toggling auto applying filters on and off", () => {
        openDashboard();

        H.getDashboardCard().within(() => {
          H.assertTableRowsCount(53);
        });

        cy.log(
          "parameter with default value should still be applied after turning auto-apply filter off",
        );
        H.openDashboardSettingsSidebar();
        H.sidesheet().within(() => {
          cy.findByLabelText(filterToggleLabel).should("be.checked");
          cy.findByText(filterToggleLabel).click();
          cy.wait("@updateDashboard");
          cy.findByLabelText(filterToggleLabel).should("not.be.checked");
        });
        H.closeDashboardSettingsSidebar();

        H.getDashboardCard().within(() => {
          H.assertTableRowsCount(53);
        });

        cy.log(
          "card result should be updated after manually updating the filter",
        );
        H.filterWidget().icon("close").click();
        H.applyFilterButton().should("be.visible").click();

        H.getDashboardCard().within(() => {
          H.assertTableRowsCount(200);
        });

        cy.log(
          "should not use the default parameter after turning auto-apply filter on again since the parameter was manually updated",
        );
        H.openDashboardSettingsSidebar();
        H.sidesheet().within(() => {
          cy.findByLabelText(filterToggleLabel).should("not.be.checked");
          cy.findAllByText(filterToggleLabel).click();
          cy.wait("@updateDashboard");
          cy.findByLabelText(filterToggleLabel).should("be.checked");
        });

        H.getDashboardCard().within(() => {
          H.assertTableRowsCount(200);
        });
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

        // shouldn't even show settings as an option for this user
        H.dashboardHeader().icon("ellipsis").click();
        H.popover().findByText("Edit settings").should("not.exist");
      });
    });

    describe("embeddings", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
      });

      describe("public embeds", () => {
        it("should apply filters after clicking the apply button when auto-apply filters is turned off", () => {
          createDashboard({ dashboardDetails: { auto_apply_filters: false } });
          cy.get("@dashboardId").then((dashboardId) => {
            H.visitPublicDashboard(dashboardId);
          });

          H.applyFilterToast().should("not.exist");
          H.filterWidget().findByText("Category").click();
          H.popover().within(() => {
            cy.findByText("Widget").click();
            cy.button("Add filter").click();
          });
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(200);
          });
          H.applyFilterButton().should("be.visible").click();
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(54);
          });
        });

        it("should not show toast", () => {
          createDashboard();
          cy.clock();
          openSlowPublicDashboard({ [FILTER.slug]: "Gadget" });
          H.filterWidget().findByText("Gadget").should("be.visible");

          cy.tick(TOAST_TIMEOUT);
          cy.wait("@cardQuery");
          H.undoToast().should("not.exist");
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
          cy.get("@dashboardId").then((dashboardId) => {
            const embeddingPayload = {
              resource: { dashboard: dashboardId },
              params: {},
            };
            H.visitEmbeddedPage(embeddingPayload);
          });

          H.applyFilterToast().should("not.exist");
          H.filterWidget().findByText("Category").click();
          H.popover().within(() => {
            cy.findByText("Widget").click();
            cy.button("Add filter").click();
          });
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(200);
          });
          H.applyFilterButton().should("be.visible").click();
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(54);
          });
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
          H.filterWidget().findByText("Gadget").should("be.visible");

          cy.tick(TOAST_TIMEOUT);
          cy.wait("@cardQuery");
          H.undoToast().should("not.exist");
        });
      });

      describe("full-app embeddings", () => {
        beforeEach(() => {
          cy.signInAsNormalUser();
        });

        it("should apply filters after clicking the apply button when auto-apply filters is turned off", () => {
          createDashboard({
            dashboardDetails: {
              name: "Full-app embedding dashboard",
              auto_apply_filters: false,
            },
          });
          cy.get("@dashboardId").then((dashboardId) => {
            visitFullAppEmbeddingUrl({
              url: `/dashboard/${dashboardId}`,
              qs: { side_nav: false, logo: false },
            });
          });
          cy.findByDisplayValue("Full-app embedding dashboard").should(
            "be.visible",
          );
          // Ensure that we're viewing the dashboard in full-app embedding mode, since `logo` is a full-app embedding parameter.
          cy.findByTestId("main-logo").should("not.exist");

          H.applyFilterToast().should("not.exist");
          H.filterWidget().findByText("Category").click();
          H.popover().within(() => {
            cy.findByText("Widget").click();
            cy.button("Add filter").click();
          });
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(200);
          });
          H.applyFilterButton().should("be.visible").click();
          H.getDashboardCard().within(() => {
            H.assertTableRowsCount(54);
          });
        });
      });
    });
  },
);

describe("scenarios > dashboards > filters > auto apply", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when disabling auto-apply filters", () => {
    createDashboard();
    openDashboard();
    cy.wait("@cardQuery");

    H.openDashboardSettingsSidebar();
    H.sidesheet().within(() => {
      cy.findByText(filterToggleLabel).click();
      cy.wait("@updateDashboard");
      cy.findByLabelText(filterToggleLabel).should("not.be.checked");
      H.expectUnstructuredSnowplowEvent({
        event: "auto_apply_filters_disabled",
      });
    });
  });

  it("should not send snowplow events when enabling auto-apply filters", () => {
    createDashboard({ dashboardDetails: { auto_apply_filters: false } });
    openDashboard();
    cy.wait("@cardQuery");

    H.openDashboardSettingsSidebar();
    H.sidesheet().within(() => {
      cy.findByText(filterToggleLabel).click();
      cy.wait("@updateDashboard");
      cy.findByLabelText(filterToggleLabel).should("be.checked");
      H.assertNoUnstructuredSnowplowEvent({
        event: "auto_apply_filters_disabled",
      });
    });
  });
});

const createDashboard = ({
  dashboardDetails: dashboardOpts = {},
  parameter = FILTER,
} = {}) => {
  const parameters = [parameter];
  H.createQuestionAndDashboard({
    questionDetails: QUESTION_DETAILS,
    dashboardDetails: {
      ...createDashboardDetails({ parameters }),
      ...dashboardOpts,
    },
  }).then(({ body: card }) => {
    H.editDashboardCard(card, getParameterMapping(card, parameters));
    cy.wrap(card.dashboard_id).as("dashboardId");
  });
};

const getParameterMapping = ({ card_id }, parameters) => ({
  parameter_mappings: parameters.map((parameter) => {
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

  H.visitDashboard("@dashboardId", { params });
};

const openSlowPublicDashboard = (params = {}) => {
  cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then((dashboardId) => {
    H.visitPublicDashboard(dashboardId, { params });
  });

  H.getDashboardCard().should("be.visible");
};

const openSlowEmbeddingDashboard = (params = {}) => {
  cy.intercept("GET", "/api/embed/dashboard/*/dashcard/*/card/*").as(
    "cardQuery",
  );

  cy.get("@dashboardId").then((dashboardId) => {
    const embeddingPayload = {
      resource: { dashboard: dashboardId },
      params: {},
    };
    H.visitEmbeddedPage(embeddingPayload, {
      setFilters: params,
    });
  });

  H.getDashboardCard().should("be.visible");
};

const visitFullAppEmbeddingUrl = ({ url, qs }) => {
  cy.visit({
    url,
    qs,
    onBeforeLoad(window) {
      // cypress runs all tests in an iframe and the app uses this property to avoid embedding mode for all tests
      // by removing the property the app would work in embedding mode
      window.Cypress = undefined;
    },
  });
};
