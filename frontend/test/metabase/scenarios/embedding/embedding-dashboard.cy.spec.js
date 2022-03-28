import {
  restore,
  popover,
  visitDashboard,
  visitEmbeddedPage,
  filterWidget,
  visitIframe,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  native: {
    query:
      "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */",
    "template-tags": {
      id: {
        id: "3fce42dd-fac7-c87d-e738-d8b3fc9d6d56",
        name: "id",
        display_name: "Id",
        type: "dimension",
        dimension: ["field", PEOPLE.ID, null],
        "widget-type": "id",
        default: null,
      },
      name: {
        id: "1fe12d96-8cf7-49e4-05a3-6ed1aea24490",
        name: "name",
        display_name: "Name",
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "category",
        default: null,
      },
      source: {
        id: "aed3c67a-820a-966b-d07b-ddf54a7f2e5e",
        name: "source",
        display_name: "Source",
        type: "dimension",
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "category",
        default: null,
      },
      user_id: {
        id: "cd4bb37d-8404-488e-f66a-6545a261bbe0",
        name: "user_id",
        display_name: "User",
        type: "dimension",
        dimension: ["field", ORDERS.USER_ID, null],
        "widget-type": "id",
        default: null,
      },
    },
  },
  display: "scalar",
};

const dashboardDetails = {
  parameters: [
    { name: "Id", slug: "id", id: "1", type: "id" },
    { name: "Name", slug: "name", id: "2", type: "category" },
    { name: "Source", slug: "source", id: "3", type: "category" },
    { name: "User", slug: "user_id", id: "4", type: "id" },
  ],
};

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
    beforeEach(() => {
      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
      });

      cy.icon("share").click();
      cy.findByText("Sharing and embedding").click();
      cy.findByText("Embed this dashboard in an application").click();
    });

    it("should be disabled by default but able to be set to editable and/or locked (metabase#20357)", () => {
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

      cy.findByText("Editable").click();

      cy.get("@allParameters").within(() => {
        cy.findByText("Id")
          .parent()
          .within(() => {
            cy.findByText("Disabled").click();
          });
      });

      cy.findByText("Locked").click();

      // set the locked parameter's value
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
        const actual = request.body.embedding_params;

        const expected = {
          id: "locked",
          name: "enabled",
        };

        assert.deepEqual(actual, expected);
      });

      // directly navigate to the embedded dashboard
      visitIframe();

      // verify that the Id parameter doesn't show up but that its value is reflected in the dashcard
      filterWidget()
        .contains("Id")
        .should("not.exist");

      cy.get(".ScalarValue")
        .invoke("text")
        .should("eq", "2");

      // verify that disabled filters don't show up
      cy.findByText("Source").should("not.exist");
      cy.findByText("User").should("not.exist");

      // only Name parameter should be visible
      openFilterOptions("Name");

      cy.findByPlaceholderText("Search by Name").type("L");
      cy.findByText("Lina Heaney").click();

      cy.button("Add filter").click();

      cy.get(".ScalarValue")
        .invoke("text")
        .should("eq", "1");
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

      cy.url().then(url => cy.visit(url + "?id=1&id=3"));
      cy.contains(".ScalarValue", "2");
    });
  });
});

function mapParameters({ id, card_id, dashboard_id } = {}) {
  return cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
    cards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        sizeX: 18,
        sizeY: 6,
        series: [],
        visualization_settings: {},
        parameter_mappings: [
          {
            parameter_id: "1",
            card_id,
            target: ["dimension", ["template-tag", "id"]],
          },
          {
            parameter_id: "2",
            card_id,
            target: ["dimension", ["template-tag", "name"]],
          },
          {
            parameter_id: "3",
            card_id,
            target: ["dimension", ["template-tag", "source"]],
          },
          {
            parameter_id: "4",
            card_id,
            target: ["dimension", ["template-tag", "user_id"]],
          },
        ],
      },
    ],
  });
}

function openFilterOptions(name) {
  filterWidget()
    .contains(name)
    .click();
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
