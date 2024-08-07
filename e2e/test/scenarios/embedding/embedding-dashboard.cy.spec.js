import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  visitDashboard,
  visitEmbeddedPage,
  filterWidget,
  visitIframe,
  getDashboardCard,
  addOrUpdateDashboardCard,
  openStaticEmbeddingModal,
  downloadAndAssert,
  assertSheetRowsCount,
  modal,
  getIframeBody,
  describeEE,
  setTokenFeatures,
  dashboardParametersContainer,
  goToTab,
  editDashboard,
  toggleRequiredParameter,
  sidebar,
  saveDashboard,
  getRequiredToggle,
  closeStaticEmbeddingModal,
  publishChanges,
  setEmbeddingParameter,
  assertEmbeddingParameter,
  multiAutocompleteInput,
  dismissDownloadStatus,
  createDashboardWithTabs,
  createQuestion,
} from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  questionDetails,
  questionDetailsWithDefaults,
  dashboardDetails,
  mapParameters,
} from "./shared/embedding-dashboard";

const { ORDERS, PEOPLE, PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding > dashboard parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/field/${ORDERS.USER_ID}/dimension`, {
      type: "external",
      name: "User ID",
      human_readable_field_id: PEOPLE.NAME,
    });

    [ORDERS.USER_ID, PEOPLE.NAME, PEOPLE.ID].forEach(id =>
      cy.request("PUT", `/api/field/${id}`, { has_field_values: "search" }),
    );

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      mapParameters({ id, card_id, dashboard_id });
    });
  });

  context("UI", () => {
    it("should be disabled by default but able to be set to editable and/or locked (metabase#20357)", () => {
      visitDashboard("@dashboardId");

      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: true });

      cy.findByLabelText("Configuring parameters").as("allParameters");

      cy.get("@allParameters").within(() => {
        // verify that all the parameters on the dashboard are defaulted to disabled
        cy.findAllByText("Disabled").should(
          "have.length",
          dashboardDetails.parameters.length,
        );

        // select the dropdown next to the Name parameter so that we can set it to editable
        cy.findByText("Name")
          .parent()
          .within(() => {
            cy.findByText("Disabled").click();
          });
      });

      popover().findByText("Editable").click();

      cy.get("@allParameters")
        .findByText("Id")
        .parent()
        .findByText("Disabled")
        .click();

      popover().findByText("Locked").click();

      modal().within(() => {
        // set the locked parameter's value
        cy.findByText("Previewing locked parameters")
          .parent()
          .findByText("Id")
          .click();
      });

      popover().within(() => {
        cy.findByPlaceholderText("Search by Name or enter an ID").type("1,3,");

        cy.button("Add filter").click();
      });

      // publish the embedded dashboard so that we can directly navigate to its url
      publishChanges("dashboard", ({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          id: "locked",
          name: "enabled",
        });
      });

      // directly navigate to the embedded dashboard
      visitIframe();

      // verify that the Id parameter doesn't show up but that its value is reflected in the dashcard
      filterWidget().contains("Id").should("not.exist");

      cy.findByTestId("scalar-value").invoke("text").should("eq", "2");

      // verify that disabled filters don't show up
      cy.findByTestId("dashboard-parameters-widget-container").within(() => {
        cy.findByText("Source").should("not.exist");
        cy.findByText("User").should("not.exist");
      });

      // only Name parameter should be visible
      openFilterOptions("Name");

      cy.findByPlaceholderText("Search by Name").type("L");
      popover().last().findByText("Lina Heaney").click();

      cy.button("Add filter").click();

      cy.findByTestId("scalar-value").invoke("text").should("eq", "1");

      cy.log(
        "Sanity check: lets make sure we can disable all previously set parameters",
      );
      cy.signInAsAdmin();

      visitDashboard("@dashboardId");

      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: false });

      cy.get("@allParameters").findByText("Locked").click();
      popover().contains("Disabled").click();

      cy.get("@allParameters").findByText("Editable").click();
      popover().contains("Disabled").click();

      publishChanges("dashboard", ({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          name: "disabled",
          id: "disabled",
        });
      });

      visitIframe();

      filterWidget().should("not.exist");

      cy.findByTestId("scalar-value").invoke("text").should("eq", "2,500");
    });

    it("should only display filters mapped to cards on the selected tab", () => {
      cy.get("@dashboardId").then(dashboardId => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          embedding_params: {
            id: "enabled",
            name: "enabled",
            source: "enabled",
            user_id: "enabled",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: dashboardId },
          params: {},
        };

        visitEmbeddedPage(payload);

        // wait for the results to load
        cy.contains("Test Dashboard");
        cy.contains("2,500");
      });

      dashboardParametersContainer().within(() => {
        cy.findByText("Id").should("be.visible");
        cy.findByText("Name").should("be.visible");
        cy.findByText("Source").should("be.visible");
        cy.findByText("User").should("be.visible");
        cy.findByText("Not Used Filter").should("not.exist");
      });

      goToTab("Tab 2");

      dashboardParametersContainer().should("not.exist");
      cy.findByTestId("embed-frame").within(() => {
        cy.findByText("Id").should("not.exist");
        cy.findByText("Name").should("not.exist");
        cy.findByText("Source").should("not.exist");
        cy.findByText("User").should("not.exist");
        cy.findByText("Not Used Filter").should("not.exist");
      });
    });

    it("should handle required parameters", () => {
      visitDashboard("@dashboardId");
      editDashboard();

      // Make one parameter required
      getDashboardFilter("Name").click();
      toggleRequiredParameter();
      sidebar().findByText("Default value").next().click();
      addWidgetStringFilter("Ferne Rosenbaum", {
        buttonLabel: "Update filter",
      });
      saveDashboard();

      // Check that parameter visibility is correct
      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: true });
      assertEmbeddingParameter("Id", "Disabled");
      assertEmbeddingParameter("Name", "Editable");
      assertEmbeddingParameter("Source", "Disabled");
      assertEmbeddingParameter("User", "Disabled");
      assertEmbeddingParameter("Not Used Filter", "Disabled");

      // We only expect name to be "enabled" because the rest
      // weren't touched and therefore aren't changed, whereas
      // "enabled" must be set by default for required params.
      publishChanges("dashboard", ({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          name: "enabled",
        });
      });

      visitIframe();

      // Filter widget must be visible
      filterWidget().contains("Name");
      // Its default value must be in the URL
      cy.location("search").should("contain", "name=Ferne+Rosenbaum");
      // And the default should be applied giving us only 1 result
      cy.findByTestId("scalar-value").invoke("text").should("eq", "1");
    });

    it("should (dis)allow setting parameters as required for a published embedding", () => {
      visitDashboard("@dashboardId");

      // Set an "editable" and "locked" parameters and leave the rest "disabled"
      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: true });
      setEmbeddingParameter("Name", "Editable");
      setEmbeddingParameter("Source", "Locked");
      publishChanges("dashboard", ({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          name: "enabled",
          source: "locked",
        });
      });

      closeStaticEmbeddingModal();
      editDashboard();

      // Check each parameter's required state
      assertRequiredEnabledForName({ name: "Name", enabled: true });
      assertRequiredEnabledForName({ name: "Source", enabled: true });
      // The rest must be disabled
      assertRequiredEnabledForName({ name: "Id", enabled: false });
      assertRequiredEnabledForName({ name: "User", enabled: false });
      assertRequiredEnabledForName({ name: "Not Used Filter", enabled: false });
    });

    it("should render cursor pointer on hover over a toggle (metabase#46223)", () => {
      visitDashboard("@dashboardId");

      cy.findAllByTestId("parameter-value-widget-target")
        .first()
        .realHover()
        .should("have.css", "cursor", "pointer");
    });
  });

  context("API", () => {
    beforeEach(() => {
      cy.get("@dashboardId").then(dashboardId => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          embedding_params: {
            id: "enabled",
            name: "enabled",
            source: "enabled",
            user_id: "enabled",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: dashboardId },
          params: {},
        };

        visitEmbeddedPage(payload);

        // wait for the results to load
        cy.contains("Test Dashboard");
        cy.contains("2,500");
      });
    });

    it("should work for all filters", () => {
      cy.log("should allow searching PEOPLE.ID by PEOPLE.NAME");

      openFilterOptions("Id");
      popover().within(() => {
        multiAutocompleteInput().type("Aly");
      });

      popover().last().contains("Alycia McCullough - 2016");

      // close the suggestions popover
      popover()
        .first()
        .within(() => {
          multiAutocompleteInput().blur();
        });

      cy.log("should allow searching PEOPLE.NAME by PEOPLE.NAME");

      openFilterOptions("Name");
      popover().within(() => {
        multiAutocompleteInput().type("{backspace}Aly");
      });

      popover().last().contains("Alycia McCullough");

      // close the suggestions popover
      popover()
        .first()
        .within(() => {
          multiAutocompleteInput().blur();
        });

      cy.log("should show values for PEOPLE.SOURCE");

      openFilterOptions("Source");
      popover().contains("Affiliate");

      cy.log("should allow searching ORDER.USER_ID by PEOPLE.NAME");

      openFilterOptions("User");
      popover().within(() => {
        multiAutocompleteInput().type("Aly");
      });

      popover().last().contains("Alycia McCullough - 2016");

      // close the suggestions popover
      popover()
        .first()
        .within(() => {
          multiAutocompleteInput().blur();
        });

      cy.log("should accept url parameters");

      cy.location().then(location =>
        cy.visit(`${location.origin}${location.pathname}?id=1&id=3`),
      );

      cy.findByTestId("scalar-value").contains("2");
    });
  });

  it("should render error message when `params` is not an object (metabase#14474)", () => {
    cy.get("@dashboardId").then(dashboardId => {
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        embedding_params: {
          id: "enabled",
          name: "enabled",
          source: "enabled",
          user_id: "enabled",
        },
        enable_embedding: true,
      });

      const invalidParamsValue = [];
      const payload = {
        resource: { dashboard: dashboardId },
        params: invalidParamsValue,
      };

      visitEmbeddedPage(payload);

      getDashboardCard()
        .findByText("There was a problem displaying this chart.")
        .should("be.visible");
    });
  });

  it("should render error without crashing when embed query returns error (metabase#34954)", () => {
    const categoryTemplateTag = {
      type: "text",
      name: "category",
      id: "377a4a4a-179e-4d86-8263-f3b3887df15f",
      "display-name": "Category",
    };
    const createdAtTemplateTag = {
      type: "dimension",
      name: "createdAt",
      id: "ae3bd89b-1b94-47db-9020-8ee74afdb67a",
      "display-name": "CreatedAt",
      dimension: ["field", PRODUCTS.CREATED_AT, null],
      "widget-type": "date/month-year",
    };
    const questionDetails = {
      native: {
        query:
          "Select * from products Where category = {{category}} [[and {{createdAt}}]]",
        "template-tags": {
          category: categoryTemplateTag,
          createdAt: createdAtTemplateTag,
        },
      },
    };

    const dashboardCategoryParameter = createMockParameter({
      name: "Category",
      slug: "category",
      id: "9cd1ee78",
      type: "string/=",
      sectionId: "string",
      values_query_type: "none",
    });
    const dashboardCreatedAtParameter = createMockParameter({
      name: "Created At",
      slug: "createdAt",
      id: "98831577",
      type: "date/month-year",
      sectionId: "date",
    });
    const dashboardDetails = {
      name: "dashboard with parameters",
      parameters: [dashboardCategoryParameter, dashboardCreatedAtParameter],
    };

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId2");

      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          parameter_mappings: [
            {
              parameter_id: dashboardCategoryParameter.id,
              card_id,
              target: ["variable", ["template-tag", categoryTemplateTag.name]],
            },
            {
              parameter_id: dashboardCreatedAtParameter.id,
              card_id,
              target: [
                "dimension",
                ["template-tag", createdAtTemplateTag.name],
              ],
            },
          ],
          visualization_settings: {
            "card.hide_empty": true,
          },
        },
      });

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        embedding_params: {
          category: "enabled",
          createdAt: "enabled",
        },
        enable_embedding: true,
      });

      const payload = {
        resource: { dashboard: dashboard_id },
        params: {},
      };

      visitEmbeddedPage(payload);
    });

    cy.log("The whole page would have crashed before the fix at this point");
    getDashboardCard()
      .findByText("There was a problem displaying this chart.")
      .should("be.visible");

    cy.log("Add a filter to complete the query");
    filterWidget().findByPlaceholderText("Category").type("Widget{enter}");

    getDashboardCard()
      .findByText("Practical Bronze Computer")
      .should("be.visible");

    cy.log("test downloading result (metabase#36721)");
    getDashboardCard().realHover();
    downloadAndAssert(
      {
        fileType: "csv",
        isDashboard: true,
        isEmbed: true,
        logResults: true,
        downloadUrl: "/api/embed/dashboard/*/dashcard/*/card/*/csv*",
        downloadMethod: "GET",
      },
      sheet => {
        expect(sheet["A1"].v).to.eq("ID");
        expect(sheet["A2"].v).to.eq(9);
        expect(sheet["B1"].v).to.eq("EAN");
        expect(sheet["B2"].v).to.eq(7217466997444);

        assertSheetRowsCount(54)(sheet);
      },
    );
    dismissDownloadStatus();
  });

  it("should send 'X-Metabase-Client' header for api requests", () => {
    cy.intercept("GET", "api/embed/dashboard/*").as("getEmbeddedDashboard");

    cy.get("@dashboardId").then(dashboardId => {
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        embedding_params: {},
        enable_embedding: true,
      });

      const payload = {
        resource: { dashboard: dashboardId },
        params: {},
      };

      visitEmbeddedPage(payload, {
        onBeforeLoad: window => {
          window.Cypress = undefined;
        },
      });

      cy.wait("@getEmbeddedDashboard").then(({ request }) => {
        expect(request?.headers?.["x-metabase-client"]).to.equal(
          "embedding-iframe",
        );
      });
    });
  });
});

describe("scenarios > embedding > dashboard parameters with defaults", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails: questionDetailsWithDefaults,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      mapParameters({ id, card_id, dashboard_id });
    });

    visitDashboard("@dashboardId");
  });

  it("card parameter defaults should apply for disabled parameters, but not for editable or locked parameters", () => {
    openStaticEmbeddingModal({ activeTab: "parameters" });

    // ID param is disabled by default
    setEmbeddingParameter("Name", "Editable");
    setEmbeddingParameter("Source", "Locked");
    publishChanges("dashboard", ({ request }) => {
      assert.deepEqual(request.body.embedding_params, {
        source: "locked",
        name: "enabled",
      });
    });

    cy.get("@dashboardId").then(dashboardId => {
      const payload = {
        resource: { dashboard: dashboardId },
        params: { source: [] },
      };

      visitEmbeddedPage(payload);

      // wait for the results to load

      // The ID default (1 and 2) should apply, because it is disabled.
      // The Name default ('Lina Heaney') should not apply, because the Name param is editable and unset
      // The Source default ('Facebook') should not apply because the param is locked but the value is unset
      // If either the Name or Source default applied the result would be 0.

      cy.contains("Test Dashboard");
      cy.findByTestId("scalar-value").invoke("text").should("eq", "2");
    });
    //visitIframe();
  });

  it("locked parameters require a value to be specified in the JWT", () => {
    openStaticEmbeddingModal({ activeTab: "parameters" });

    // ID param is disabled by default
    setEmbeddingParameter("Name", "Editable");
    setEmbeddingParameter("Source", "Locked");
    publishChanges("dashboard", ({ request }) => {
      assert.deepEqual(request.body.embedding_params, {
        source: "locked",
        name: "enabled",
      });
    });

    visitIframe();

    // The Source parameter is 'locked', and no value has been specified in the token,
    // thus the API responds with "You must specify a value for :source in the JWT."
    // and the card will not display.

    getDashboardCard()
      .findByText("There was a problem displaying this chart.")
      .should("be.visible");
  });
});

describeEE("scenarios > embedding > dashboard appearance", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should not rerender the static embed preview unnecessarily (metabase#38271)", () => {
    const textFilter = createMockParameter({
      id: "3",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
      sectionId: "string",
    });

    const dashboardDetails = {
      name: "dashboard name",
      enable_embedding: true,
      embedding_params: {
        /**
         * Make sure the parameter is shown in embed preview, because it previously
         * caused the iframe to rerender even when only the hash part of the embed
         * preview URL is changed.
         *
         * @see useSyncedQueryString in frontend/src/metabase/hooks/use-synced-query-string.ts
         */
        [textFilter.slug]: "enabled",
      },
      parameters: [textFilter],
    };

    const questionDetails = {
      name: "Orders",
      query: {
        "source-table": ORDERS_ID,
      },
    };
    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    cy.intercept(
      "GET",
      "api/preview_embed/dashboard/*",
      cy.spy().as("previewEmbedSpy"),
    ).as("previewEmbed");

    openStaticEmbeddingModal({
      activeTab: "parameters",
      previewMode: "preview",
      // EE users don't have to accept terms
      acceptTerms: false,
    });

    cy.wait("@previewEmbed");

    modal().within(() => {
      cy.findByRole("tab", { name: "Look and Feel" }).click();
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard theme");
      getIframeBody()
        .findByTestId("embed-frame")
        .invoke("attr", "data-embed-theme")
        .then(embedTheme => {
          expect(embedTheme).to.eq("light"); // default value
        });

      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dark").click({ force: true });
      cy.wait(1000);
      getIframeBody()
        .findByTestId("embed-frame")
        .invoke("attr", "data-embed-theme")
        .then(embedTheme => {
          expect(embedTheme).to.eq("night");
        });

      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard title");
      getIframeBody().findByText(dashboardDetails.name).should("exist");
      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dashboard title").click({ force: true });
      getIframeBody().findByText(dashboardDetails.name).should("not.exist");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard border");
      getIframeBody()
        .findByTestId("embed-frame")
        .should("have.css", "border-top-width", "1px");
      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dashboard border").click({ force: true });
      getIframeBody()
        .findByTestId("embed-frame")
        .should("have.css", "border-top-width", "0px");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert font");
      getIframeBody().should("have.css", "font-family", "Lato, sans-serif");
      cy.findByLabelText("Font").click();
    });

    // Since the select popover is rendered outside of the modal, we need to exit the modal context first.
    popover().findByText("Oswald").click();
    modal().within(() => {
      getIframeBody().should("have.css", "font-family", "Oswald, sans-serif");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);
    });
  });

  it("should not rerender the static dashboard with tabs preview unnecessarily (metabase#46378)", () => {
    const textFilter = createMockParameter({
      id: "3",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
      sectionId: "string",
    });

    const TAB_1 = { id: "11", name: "Tab 1" };
    const TAB_2 = { id: "12", name: "Tab 2" };

    const dashboardDetails = {
      name: "dashboard name",
      enable_embedding: true,
      embedding_params: {
        /**
         * Make sure the parameter is shown in embed preview, because it previously
         * caused the iframe to rerender even when only the hash part of the embed
         * preview URL is changed.
         *
         * @see useSyncedQueryString in frontend/src/metabase/hooks/use-synced-query-string.ts
         */
        [textFilter.slug]: "enabled",
      },
      parameters: [textFilter],
      tabs: [TAB_1, TAB_2],
    };

    const questionDetails = {
      name: "Orders",
      query: {
        "source-table": ORDERS_ID,
      },
    };
    createQuestion(questionDetails)
      .then(({ body: { id: card_id } }) => {
        createDashboardWithTabs({
          ...dashboardDetails,
          dashcards: [
            {
              id: -1,
              card_id,
              dashboard_tab_id: TAB_1.id,
              row: 0,
              col: 0,
              size_x: 8,
              size_y: 12,
            },
          ],
        });
      })
      .then(dashboard => {
        visitDashboard(dashboard.id);
      });

    cy.intercept(
      "GET",
      "api/preview_embed/dashboard/*",
      cy.spy().as("previewEmbedSpy"),
    ).as("previewEmbed");

    openStaticEmbeddingModal({
      activeTab: "parameters",
      previewMode: "preview",
      // EE users don't have to accept terms
      acceptTerms: false,
    });

    cy.wait("@previewEmbed");

    modal().within(() => {
      cy.findByRole("tab", { name: "Look and Feel" }).click();
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard theme");
      getIframeBody()
        .findByTestId("embed-frame")
        .invoke("attr", "data-embed-theme")
        .then(embedTheme => {
          expect(embedTheme).to.eq("light"); // default value
        });

      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dark").click({ force: true });
      cy.wait(1000);
      getIframeBody()
        .findByTestId("embed-frame")
        .invoke("attr", "data-embed-theme")
        .then(embedTheme => {
          expect(embedTheme).to.eq("night");
        });

      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard title");
      getIframeBody().findByText(dashboardDetails.name).should("exist");
      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dashboard title").click({ force: true });
      getIframeBody().findByText(dashboardDetails.name).should("not.exist");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert dashboard border");
      getIframeBody()
        .findByTestId("embed-frame")
        .should("have.css", "border-top-width", "1px");
      // We're getting an input element which is 0x0 in size
      cy.findByLabelText("Dashboard border").click({ force: true });
      getIframeBody()
        .findByTestId("embed-frame")
        .should("have.css", "border-top-width", "0px");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);

      cy.log("Assert font");
      getIframeBody().should("have.css", "font-family", "Lato, sans-serif");
      cy.findByLabelText("Font").click();
    });

    // Since the select popover is rendered outside of the modal, we need to exit the modal context first.
    popover().findByText("Oswald").click();
    modal().within(() => {
      getIframeBody().should("have.css", "font-family", "Oswald, sans-serif");
      cy.get("@previewEmbedSpy").should("have.callCount", 1);
    });
  });
});

function openFilterOptions(name) {
  filterWidget().contains(name).click();
}

function getDashboardFilter(name) {
  return cy
    .findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name);
}

function assertRequiredEnabledForName({ name, enabled }) {
  getDashboardFilter(name).click();
  getRequiredToggle().should(enabled ? "be.enabled" : "not.be.enabled");
}
