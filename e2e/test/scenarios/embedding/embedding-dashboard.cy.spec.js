import {
  restore,
  popover,
  visitDashboard,
  visitEmbeddedPage,
  filterWidget,
  visitIframe,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  questionDetails,
  questionDetailsWithDefaults,
  dashboardDetails,
  mapParameters,
} from "./shared/embedding-dashboard";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

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

      cy.icon("share").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Embed in your application").click();

      cy.findByRole("heading", { name: "Parameters" })
        .parent()
        .as("allParameters")
        .within(() => {
          // verify that all the parameters on the dashboard are defaulted to disabled
          cy.findAllByText("Disabled").should("have.length", 4);

          // select the dropdown next to the Name parameter so that we can set it to editable
          cy.findByText("Name")
            .parent()
            .within(() => {
              cy.findByText("Disabled").click();
            });
        });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Editable").click();

      cy.get("@allParameters").within(() => {
        cy.findByText("Id")
          .parent()
          .within(() => {
            cy.findByText("Disabled").click();
          });
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Locked").click();

      // set the locked parameter's value
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Preview Locked Parameters")
        .parent()
        .within(() => {
          cy.findByText("Id").click();
        });

      cy.findByPlaceholderText("Search by Name or enter an ID").type(
        "1{enter}3{enter}",
      );

      cy.button("Add filter").click();

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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Source").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User").should("not.exist");

      // only Name parameter should be visible
      openFilterOptions("Name");

      cy.findByPlaceholderText("Search by Name").type("L");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Lina Heaney").click();

      cy.button("Add filter").click();

      cy.get(".ScalarValue").invoke("text").should("eq", "1");

      cy.log(
        "Sanity check: lets make sure we can disable all previously set parameters",
      );
      cy.signInAsAdmin();

      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
      });

      cy.icon("share").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Embed in your application").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Locked").click();
      popover().contains("Disabled").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Editable").click();
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
    cy.icon("share").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Embed in your application").click();
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

  cy.button("Publish").click();

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
  cy.findByText("Which parameters can users of this embed use?")
    .parent()
    .findByText(name).siblings("a").click();

  popover().contains(filter).click();
}
