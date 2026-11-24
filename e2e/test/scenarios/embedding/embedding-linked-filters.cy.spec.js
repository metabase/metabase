const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  guiDashboard,
  guiQuestion,
  mapGUIDashboardParameters,
  mapNativeDashboardParameters,
  nativeDashboardDetails,
  nativeQuestionDetails,
} from "./shared/embedding-linked-filters";

const { PRODUCTS, PRODUCTS_ID, FEEDBACK, FEEDBACK_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding > dashboard > linked filters (metabase#13639, metabase#13868)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  context("SQL question with field filters", () => {
    beforeEach(() => {
      H.createNativeQuestionAndDashboard({
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

    it("works when main filter's value is set through URL, hidden, or set through UI", () => {
      cy.log("works when main filter's value is set through URL");
      cy.get("@dashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        H.visitEmbeddedPage(payload, {
          setFilters: { state: "AK" },
        });
      });

      H.filterWidget().should("have.length", 2);

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      H.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          H.fieldValuesTextbox().click();
        });

      H.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });

      cy.log(
        "works when main filter's value is set through URL and when it is hidden at the same time",
      );
      cy.get("@dashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        H.visitEmbeddedPage(payload, {
          setFilters: { state: "AK" },
          additionalHashOptions: {
            hideFilters: ["state"],
          },
        });
      });

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      H.filterWidget().should("have.length", 1).and("contain", "City").click();

      searchFieldValuesFilter();

      H.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          H.fieldValuesTextbox().click();
        });
      H.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });

      cy.log(
        "works when both filters are enabled and their values are set through UI",
      );
      cy.get("@dashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        H.visitEmbeddedPage(payload);
      });

      cy.findByRole("heading", { name: nativeDashboardDetails.name });
      H.getDashboardCard().contains(nativeQuestionDetails.name);

      H.chartPathWithFillColor("#509EE3").should("have.length", 49);

      assertOnXYAxisLabels({ xLabel: "STATE", yLabel: "count" });

      H.echartsContainer()
        .get("text")
        .should("contain", "TX")
        .and("contain", "AK");

      openFilterOptions("State");

      H.popover().findByText("AK").click();
      H.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=&state=AK");

      H.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("not.contain", "TX");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();
      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      H.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          H.fieldValuesTextbox().click();
        });

      H.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    it("works with auto-apply filters disabled and when main filter is locked", () => {
      cy.log(
        "works when both filters are enabled and their values are set through UI with auto-apply filters disabled",
      );
      cy.get("@dashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          auto_apply_filters: false,
        });

        H.visitEmbeddedPage(payload);
      });

      cy.findByRole("heading", { name: nativeDashboardDetails.name });
      H.getDashboardCard().contains(nativeQuestionDetails.name);

      assertOnXYAxisLabels({ xLabel: "STATE", yLabel: "count" });

      H.chartPathWithFillColor("#509EE3").should("have.length", 49);
      H.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("contain", "TX");

      openFilterOptions("State");

      H.applyFilterToast().should("not.exist");

      H.popover().findByText("AK").click();
      H.popover().button("Add filter").click();

      H.chartPathWithFillColor("#509EE3").should("have.length", 49);

      H.applyFilterButton().click();
      H.applyFilterToast().should("not.exist");

      cy.location("search").should("eq", "?city=&state=AK");

      H.echartsContainer()
        .get("text")
        .should("contain", "AK")
        .and("not.contain", "TX");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      openFilterOptions("City");

      searchFieldValuesFilter();

      H.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          H.fieldValuesTextbox().click();
        });
      H.popover().button("Add filter").click();

      H.applyFilterButton().click();
      H.applyFilterToast().should("not.exist");

      cy.location("search").should("eq", "?city=Anchorage&state=AK");

      H.chartPathWithFillColor("#509EE3").should("have.length", 1).realHover();

      H.assertEChartsTooltip({
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });

      cy.log("works when main filter is locked");
      cy.signInAsAdmin();
      cy.get("@dashboardId").then((dashboard_id) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          auto_apply_filters: true,
          embedding_params: {
            city: "enabled",
            state: "locked",
          },
        });

        const payload = {
          resource: { dashboard: dashboard_id },
          params: { state: ["AK"] },
        };

        H.visitEmbeddedPage(payload);
      });

      H.filterWidget().should("have.length", 1).and("contain", "City").click();

      searchFieldValuesFilter();

      H.popover()
        .filter(":contains('Add filter')")
        .within(() => {
          H.fieldValuesTextbox().click();
        });
      H.popover().button("Add filter").click();

      cy.location("search").should("eq", "?city=Anchorage");
    });
  });

  context("GUI question in the dashboard", () => {
    beforeEach(() => {
      H.createQuestionAndDashboard({
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

    it("works when filter values are set through UI or URL, and when the default filter is hidden or locked", () => {
      cy.log(
        "works when both filters are enabled and their values are set through UI",
      );
      cy.get("@guiDashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        H.visitEmbeddedPage(payload);
      });

      // ID filter already comes with the default value
      cy.location("search").should("eq", "?category=&id_filter=1");

      // But it should still be editable, and that's why we see two filter widgets
      H.filterWidget().should("have.length", 2).contains("Category").click();

      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
        cy.button("Add filter").click();
      });

      cy.location("search").should("eq", "?category=Gizmo&id_filter=1");

      H.tableInteractiveBody()
        .findAllByRole("row")
        .should("have.length", 1)
        .and("contain", "Gizmo");

      cy.log("works when main filter's value is set through URL");
      cy.get("@guiDashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        cy.log("Make sure we can override the default value");
        H.visitEmbeddedPage(payload, { setFilters: { id_filter: 4 } });

        cy.location("search").should("eq", "?id_filter=4");

        H.filterWidget().should("have.length", 2).contains("Category").click();

        H.popover().within(() => {
          cy.findByText("Doohickey").click();
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Widget").should("not.exist");

          cy.button("Add filter").click();
        });

        cy.location("search").should("eq", "?category=Doohickey&id_filter=4");

        H.tableInteractiveBody()
          .findAllByRole("row")
          .should("have.length", 1)
          .and("contain", "Doohickey");

        cy.log("Make sure we can set multiple values");
        cy.window().then(
          (win) =>
            (win.location.search = "?category=Widget&id_filter=4&id_filter=29"),
        );

        H.filterWidget()
          .should("have.length", 2)
          .and("contain", "2 selections")
          .and("contain", "Widget");

        H.tableInteractiveBody()
          .findAllByRole("row")
          .should("have.length", 1)
          .and("contain", "Widget")
          .and("contain", "Durable Steel Toucan");

        removeValueForFilter("Category");

        H.tableInteractiveBody()
          .findAllByRole("row")
          .should("have.length", 2)
          .and("contain", "Widget")
          .and("contain", "Doohickey")
          .and("contain", "Durable Steel Toucan");

        cy.findByText("2 selections").click();

        // Remove one of the previously set filter values
        H.popover().within(() => H.removeFieldValuesValue(1));

        cy.button("Update filter").click();

        H.tableInteractiveBody()
          .findAllByRole("row")
          .should("have.length", 1)
          .and("contain", "Doohickey");

        openFilterOptions("Category");

        H.popover().within(() => {
          cy.findByText("Doohickey");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });

      cy.log("works when the default filter is hidden");
      cy.get("@guiDashboardId").then((dashboard_id) => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        H.visitEmbeddedPage(payload, {
          additionalHashOptions: {
            hideFilters: ["id_filter"],
          },
        });
      });

      H.tableInteractiveBody()
        .findAllByRole("row")
        .should("have.length", 1)
        .and("contain", "Gizmo");

      H.filterWidget()
        .should("have.length", 1)
        .and("contain", "Category")
        .click();

      H.popover().within(() => {
        cy.findByText("Gizmo");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.log("works when the default filter is locked");
      cy.signInAsAdmin();
      cy.get("@guiDashboardId").then((dashboard_id) => {
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

        H.visitEmbeddedPage(payload);
      });

      H.tableInteractiveBody()
        .findAllByRole("row")
        .should("have.length", 1)
        .and("contain", "Gizmo");

      H.filterWidget()
        .should("have.length", 1)
        .and("contain", "Category")
        .click();

      H.popover().within(() => {
        cy.findByText("Gizmo");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });
    });
  });
});

describe("dashboard preview", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID },
  };

  const filter3 = {
    name: "Text 2",
    slug: "text_2",
    id: "b0665b6a",
    type: "string/=",
    sectionId: "string",
  };

  const filter2 = {
    name: "Text 1",
    slug: "text_1",
    id: "d4c9f2e5",
    type: "string/=",
    sectionId: "string",
  };

  const filter = {
    filteringParameters: [filter2.id],
    name: "Text",
    slug: "text",
    id: "d1b69627",
    type: "string/=",
    sectionId: "string",
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );
    cy.intercept("GET", "/api/preview_embed/dashboard/**/params/**/values").as(
      "previewValues",
    );

    H.restore();
    cy.signInAsAdmin();
  });

  it("dashboard linked filters values don't work in static embed preview (metabase#37914)", () => {
    const dashboardDetails = {
      parameters: [filter, filter2, filter3],
      enable_embedding: true,
      embedding_params: {
        [filter.slug]: "enabled",
        [filter2.slug]: "enabled",
        [filter3.slug]: "enabled",
      },
    };
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter2.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter3.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    H.modal().within(() => {
      // Makes it less likely to flake.
      cy.wait("@previewDashboard");

      H.getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
        cy.wait("@previewValues");
        H.popover().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.log("Assert filter 1");
        cy.button(filter.name).click();
        H.popover().within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });
    });
  });

  it("dashboard linked filters values in embed preview don't behave like embedding (metabase#41635)", () => {
    const dashboardDetails = {
      parameters: [filter, filter2, filter3],
      enable_embedding: true,
      embedding_params: {
        [filter.slug]: "enabled",
        [filter2.slug]: "locked",
        [filter3.slug]: "locked",
      },
    };
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter2.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter3.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    // Makes it less likely to flake.
    cy.wait("@previewDashboard");

    cy.log("Set the first locked parameter values");
    H.modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 1")
      .click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.log("Set the second locked parameter values");
    H.modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 2")
      .click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.findByText("Gizmo").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    // Wait for the iframe to load
    H.getIframeBody().within(() => {
      cy.button(filter.name).should("not.exist");
    });

    H.getIframeBody().within(() => {
      cy.log("Assert filter 1");
      cy.button(filter.name).click();
      H.popover().within(() => {
        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });
    });
  });
});

describe("issue 57028", () => {
  const lockedContainsBodyFilter = {
    name: "locked_contains_body",
    slug: "locked_contains_body",
    id: "e6588080",
    type: "string/contains",
    sectionId: "string",
    isMultiSelect: true,
    values_query_type: "none",
  };

  const emailFilter = {
    name: "Email",
    slug: "email",
    id: "d31e550f",
    type: "string/=",
    sectionId: "string",
    values_query_type: "list",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("static embedded editable filter should load dropdown values when a string/contains locked param has multiple values (metabase#57028)", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Feedback",
        query: { "source-table": FEEDBACK_ID },
      },
      dashboardDetails: {
        parameters: [lockedContainsBodyFilter, emailFilter],
        enable_embedding: true,
        embedding_params: {
          [lockedContainsBodyFilter.slug]: "locked",
          [emailFilter.slug]: "enabled",
        },
      },
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: lockedContainsBodyFilter.id,
              target: ["dimension", ["field", FEEDBACK.BODY, null]],
            },
            {
              card_id,
              parameter_id: emailFilter.id,
              target: ["dimension", ["field", FEEDBACK.EMAIL, null]],
            },
          ],
        },
      });

      cy.intercept(
        "GET",
        `/api/embed/dashboard/*/params/${emailFilter.id}/values`,
      ).as("emailValues");

      H.visitEmbeddedPage({
        resource: { dashboard: dashboard_id },
        params: {
          [lockedContainsBodyFilter.slug]: ["March", "damp", "somewhat"],
        },
      });
    });

    H.filterWidget().contains("Email").click();

    cy.wait("@emailValues").its("response.statusCode").should("eq", 200);

    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").should("be.visible");
      cy.findAllByRole("checkbox").its("length").should("be.greaterThan", 0);
    });
  });
});

function openFilterOptions(name) {
  H.filterWidget().contains(name).click();
}

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  H.echartsContainer().get("text").contains(xLabel);

  H.echartsContainer().get("text").contains(yLabel);
}

function searchFieldValuesFilter() {
  cy.findByTestId("parameter-value-dropdown").within(() => {
    H.fieldValuesTextbox().type("An");
  });

  cy.findByTestId("field-values-widget").within(() => {
    cy.findByText("Kiana");
    cy.findByText("Anacoco").should("not.exist");
    cy.findByText("Anchorage").click();
  });
}

function removeValueForFilter(label) {
  H.filterWidget({ name: label }).icon("close").click();
}
