import {
  guiDashboard,
  guiQuestion,
  mapGUIDashboardParameters,
  mapNativeDashboardParameters,
  nativeDashboardDetails,
  nativeQuestionDetails,
} from "./shared/embedding-linked-filters";

describe("scenarios > embedding > dashboard > linked filters (metabase#13639, metabase#13868)", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  context("SQL question with field filters", () => {
    beforeEach(() => {
      cy.createNativeQuestionAndDashboard({
        questionDetails: nativeQuestionDetails,
        dashboardDetails: nativeDashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");

        mapNativeDashboardParameters({ id, card_id, dashboard_id });

        // Enable embedding for this dashboard with both the city and state filters enabled
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            city: "enabled",
            state: "enabled",
          },
          enable_embedding: true,
        });
      });
    });

    it("works when both filters are enabled and their values are set through UI", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.visitEmbeddedPage(payload);
      });

      cy.findByRole("heading", { name: nativeDashboardDetails.name });
      cy.getDashboardCard().contains(nativeQuestionDetails.name);

      cy.chartPathWithFillColor("#509EE3").should("have.length", 49);

      assertOnXYAxisLabels({ xLabel: "STATE", yLabel: "count" });

      cy.echartsContainer()
        .get("text")
        .should("contain", "TX")
        .and("contain", "AK");

      openFilterOptions("State");

      cy.popover().findByText("AK").click();
      cy.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=&state=AK");

      cy.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("not.contain", "TX");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();
      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      cy.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          cy.fieldValuesInput().blur();
        });

      cy.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    it("works when both filters are enabled and their values are set through UI with auto-apply filters disabled", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          auto_apply_filters: false,
        });

        cy.visitEmbeddedPage(payload);
      });

      cy.findByRole("heading", { name: nativeDashboardDetails.name });
      cy.getDashboardCard().contains(nativeQuestionDetails.name);

      assertOnXYAxisLabels({ xLabel: "STATE", yLabel: "count" });

      cy.chartPathWithFillColor("#509EE3").should("have.length", 49);
      cy.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("contain", "TX");

      openFilterOptions("State");

      cy.button("Apply").should("not.exist");

      cy.popover().findByText("AK").click();
      cy.popover().button("Add filter").click();

      cy.button("Apply").should("be.visible").click();
      cy.button("Apply").should("not.exist");

      cy.location("search").should("eq", "?city=&state=AK");

      cy.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("not.contain", "TX");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      cy.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          cy.fieldValuesInput().blur();
        });
      cy.popover().button("Add filter").click();

      cy.button("Apply").should("be.visible").click();
      cy.button("Apply").should("not.exist");

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    it("works when main filter's value is set through URL", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.visitEmbeddedPage(payload, {
          setFilters: { state: "AK" },
        });
      });

      cy.filterWidget().should("have.length", 2);

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      cy.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          cy.fieldValuesInput().blur();
        });

      cy.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    it("works when main filter's value is set through URL and when it is hidden at the same time", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.visitEmbeddedPage(payload, {
          setFilters: { state: "AK" },
          additionalHashOptions: {
            hideFilters: ["state"],
          },
        });
      });

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      cy.filterWidget().should("have.length", 1).and("contain", "City").click();

      searchFieldValuesFilter();

      cy.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          cy.fieldValuesInput().blur();
        });
      cy.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      cy.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      cy.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    it("works when main filter is locked", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            city: "enabled",
            state: "locked",
          },
        });

        const payload = {
          resource: { dashboard: dashboard_id },
          params: { state: ["AK"] },
        };

        cy.visitEmbeddedPage(payload);
      });

      cy.filterWidget().should("have.length", 1).and("contain", "City").click();

      searchFieldValuesFilter();

      cy.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          cy.fieldValuesInput().blur();
        });
      cy.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage");
    });
  });

  context("GUI question in the dashboard", () => {
    beforeEach(() => {
      cy.createQuestionAndDashboard({
        questionDetails: guiQuestion,
        dashboardDetails: guiDashboard,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.wrap(dashboard_id).as("guiDashboardId");

        mapGUIDashboardParameters(id, card_id, dashboard_id);

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            id_filter: "enabled",
            category: "enabled",
          },
          enable_embedding: true,
        });
      });
    });

    it("works when both filters are enabled and their values are set through UI", () => {
      cy.get("@guiDashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.visitEmbeddedPage(payload);
      });

      // ID filter already comes with the default value
      cy.location("search").should("eq", "?category=&id_filter=1");

      // But it should still be editable, and that's why we see two filter widgets
      cy.filterWidget().should("have.length", 2).contains("Category").click();

      cy.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
        cy.button("Add filter").click();
      });

      cy.location("search").should("eq", "?category=Gizmo&id_filter=1");

      cy.findByTestId("table-row")
        .should("have.length", 1)
        .and("contain", "Gizmo");
    });

    it("works when main filter's value is set through URL", () => {
      cy.get("@guiDashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.log("Make sure we can override the default value");
        cy.visitEmbeddedPage(payload, { setFilters: { id_filter: 4 } });

        cy.location("search").should("eq", "?id_filter=4");

        cy.filterWidget().should("have.length", 2).contains("Category").click();

        cy.popover().within(() => {
          cy.findByText("Doohickey").click();
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Widget").should("not.exist");

          cy.button("Add filter").click();
        });

        cy.location("search").should("eq", "?category=Doohickey&id_filter=4");

        cy.findByTestId("table-row")
          .should("have.length", 1)
          .and("contain", "Doohickey");

        cy.log("Make sure we can set multiple values");
        cy.window().then(
          win =>
            (win.location.search = "?category=Widget&id_filter=4&id_filter=29"),
        );

        cy.filterWidget()
          .should("have.length", 2)
          .and("contain", "2 selections")
          .and("contain", "Widget");

        cy.findByTestId("table-row")
          .should("have.length", 1)
          .and("contain", "Widget")
          .and("contain", "Durable Steel Toucan");

        removeValueForFilter("Category");

        cy.findAllByTestId("table-row")
          .should("have.length", 2)
          .and("contain", "Widget")
          .and("contain", "Doohickey")
          .and("contain", "Durable Steel Toucan");

        cy.findByText("2 selections").click();

        // Remove one of the previously set filter values
        cy.popover().within(() => cy.removeFieldValuesValue(1));

        cy.button("Update filter").click();

        cy.findByTestId("table-row")
          .should("have.length", 1)
          .and("contain", "Doohickey");

        openFilterOptions("Category");

        cy.popover().within(() => {
          cy.findByText("Doohickey");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });
    });

    it("works when the default filter is hidden", () => {
      cy.get("@guiDashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.visitEmbeddedPage(payload, {
          additionalHashOptions: {
            hideFilters: ["id_filter"],
          },
        });
      });

      cy.findByTestId("table-row")
        .should("have.length", 1)
        .and("contain", "Gizmo");

      cy.filterWidget()
        .should("have.length", 1)
        .and("contain", "Category")
        .click();

      cy.popover().within(() => {
        cy.findByText("Gizmo");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });
    });

    it("works when the default filter is locked", () => {
      cy.get("@guiDashboardId").then(dashboard_id => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            id_filter: "locked",
            category: "enabled",
          },
        });

        const payload = {
          resource: { dashboard: dashboard_id },
          params: { id_filter: [1] },
        };

        cy.visitEmbeddedPage(payload);
      });

      cy.findByTestId("table-row")
        .should("have.length", 1)
        .and("contain", "Gizmo");

      cy.filterWidget()
        .should("have.length", 1)
        .and("contain", "Category")
        .click();

      cy.popover().within(() => {
        cy.findByText("Gizmo");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });
    });
  });
});

function openFilterOptions(name) {
  cy.filterWidget().contains(name).click();
}

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.echartsContainer().get("text").contains(xLabel);

  cy.echartsContainer().get("text").contains(yLabel);
}

function searchFieldValuesFilter() {
  cy.findByTestId("parameter-value-dropdown").within(() => {
    cy.fieldValuesInput().type("An");
  });

  cy.findByTestId("field-values-widget").within(() => {
    cy.findByText("Kiana");
    cy.findByText("Anacoco").should("not.exist");
    cy.findByText("Anchorage").click();
  });
}

function removeValueForFilter(label) {
  cy.get("legend")
    .contains(label)
    .closest("fieldset")
    .find(".Icon-close")
    .click();
}
