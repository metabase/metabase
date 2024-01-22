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
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  questionDetails,
  questionDetailsWithDefaults,
  dashboardDetails,
  mapParameters,
} from "./shared/embedding-dashboard";

const { ORDERS, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

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
      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
      });

      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: true });

      cy.findByLabelText("Enable or lock parameters").as("allParameters");

      cy.get("@allParameters").within(() => {
        // verify that all the parameters on the dashboard are defaulted to disabled
        cy.findAllByText("Disabled").should("have.length", 4);

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
        cy.findByText("Preview locked parameters")
          .parent()
          .findByText("Id")
          .click();
      });

      popover().within(() => {
        cy.findByPlaceholderText("Search by Name or enter an ID").type(
          "1{enter}3{enter}",
        );

        cy.button("Add filter").click();
      });

      // publish the embedded dashboard so that we can directly navigate to its url
      publishChanges(({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          id: "locked",
          name: "enabled",
        });
      });

      // directly navigate to the embedded dashboard
      visitIframe();

      // verify that the Id parameter doesn't show up but that its value is reflected in the dashcard
      filterWidget().contains("Id").should("not.exist");

      cy.get(".ScalarValue").invoke("text").should("eq", "2");

      // verify that disabled filters don't show up
      cy.findByTestId("dashboard-parameters-widget-container").within(() => {
        cy.findByText("Source").should("not.exist");
        cy.findByText("User").should("not.exist");
      });

      // only Name parameter should be visible
      openFilterOptions("Name");

      cy.findByPlaceholderText("Search by Name").type("L");
      popover().findByText("Lina Heaney").click();

      cy.button("Add filter").click();

      cy.get(".ScalarValue").invoke("text").should("eq", "1");

      cy.log(
        "Sanity check: lets make sure we can disable all previously set parameters",
      );
      cy.signInAsAdmin();

      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
      });

      openStaticEmbeddingModal({ activeTab: "parameters", acceptTerms: false });

      cy.get("@allParameters").findByText("Locked").click();
      popover().contains("Disabled").click();

      cy.get("@allParameters").findByText("Editable").click();
      popover().contains("Disabled").click();

      publishChanges(({ request }) => {
        assert.deepEqual(request.body.embedding_params, {
          name: "disabled",
          id: "disabled",
        });
      });

      visitIframe();

      filterWidget().should("not.exist");

      cy.get(".ScalarValue").invoke("text").should("eq", "2,500");
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
        cy.findByPlaceholderText("Search by Name or enter an ID").type("Aly");

        cy.contains("Alycia McCullough - 2016");
      });

      cy.log("should allow searching PEOPLE.NAME by PEOPLE.NAME");

      openFilterOptions("Name");
      popover().within(() => {
        cy.findByPlaceholderText("Search by Name").type("Aly");

        cy.contains("Alycia McCullough");
      });

      cy.log("should show values for PEOPLE.SOURCE");

      openFilterOptions("Source");
      popover().contains("Affiliate");

      cy.log("should allow searching ORDER.USER_ID by PEOPLE.NAME");

      openFilterOptions("User");
      popover().within(() => {
        cy.findByPlaceholderText("Search by Name or enter an ID").type("Aly");

        cy.contains("Alycia McCullough - 2016");
      });

      cy.log("should accept url parameters");

      cy.location().then(location =>
        cy.visit(`${location.origin}${location.pathname}?id=1&id=3`),
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(".ScalarValue", "2");
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

    const dashboardCategoryParameter = {
      name: "Category",
      slug: "category",
      id: "9cd1ee78",
      type: "string/=",
      sectionId: "string",
      values_query_type: "none",
    };
    const dashboardCreatedAtParameter = {
      name: "Created At",
      slug: "createdAt",
      id: "98831577",
      type: "date/month-year",
      sectionId: "date",
    };
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
      },
      sheet => {
        expect(sheet["A1"].v).to.eq("ID");
        expect(sheet["A2"].v).to.eq(9);
        expect(sheet["B1"].v).to.eq("EAN");
        expect(sheet["B2"].v).to.eq(7217466997444);

        assertSheetRowsCount(54)(sheet);
      },
    );
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

    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
    });
  });

  it("card parameter defaults should apply for disabled parameters, but not for editable or locked parameters", () => {
    openStaticEmbeddingModal({ activeTab: "parameters" });

    // ID param is disabled by default
    setParameter("Name", "Editable");
    setParameter("Source", "Locked");
    publishChanges(({ request }) => {
      assert.deepEqual(request.body.embedding_params, {
        source: "locked",
        name: "enabled",
      });
    });

    visitIframe();
    // The ID default (1 and 2) should apply, because it is disabled.
    // The Name default ('Lina Heaney') should not apply, because the Name param is editable and unset
    // The Source default ('Facebook') should not apply because the param is locked but the value is unset
    // If either the Name or Source default applied the result would be 0.
    cy.get(".ScalarValue").invoke("text").should("eq", "2");
  });
});

function openFilterOptions(name) {
  filterWidget().contains(name).click();
}

function publishChanges(callback) {
  cy.intercept("PUT", "/api/dashboard/*").as("publishChanges");

  cy.button("Publish changes").click();

  cy.wait(["@publishChanges", "@publishChanges"]).then(xhrs => {
    // Unfortunately, the order of requests is not always the same.
    // Therefore, we must first get the one that has the `embedding_params` and then assert on it.
    const targetXhr = xhrs.find(({ request }) =>
      Object.keys(request.body).includes("embedding_params"),
    );
    callback && callback(targetXhr);
  });
}

function setParameter(name, filter) {
  cy.findByLabelText("Enable or lock parameters")
    .parent()
    .findByText(name)
    .siblings("a")
    .click();

  popover().contains(filter).click();
}
