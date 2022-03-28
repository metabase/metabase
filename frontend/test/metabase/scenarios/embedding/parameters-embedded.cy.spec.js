import {
  restore,
  popover,
  visitDashboard,
  visitEmbeddedPage,
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

describe("scenarios > dashboard > parameters-embedded", () => {
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

  describe("embedded parameters", () => {
    it("should be disabled by default but able to be set to editable (metabase#20357)", () => {
      visitDashboard(2);
      cy.icon("share").click();
      cy.findByText("Sharing and embedding").click();
      cy.findByText("Embed this dashboard in an application").click();

      cy.get(".Modal--full").within(() => {
        // verify that all the parameters on the dashboard are defaulted to disabled
        cy.findAllByText("Disabled").should("have.length", 4);

        // select the dropdown next to the Id parameter so that we can set it to editable
        cy.findByText("Id")
          .parent()
          .within(() => {
            cy.findByText("Disabled").click();
          });
      });

      cy.findByText("Editable").click();

      // publish the embedded dashboard so that we can directly navigate to its url
      cy.findByText("Publish").click();

      // directly navigate to the embedded dashboard
      cy.document().then(doc => {
        const iframe = doc.querySelector("iframe");
        cy.visit(iframe.src);
      });

      // verify that only the Id parameter shows up and is editable
      cy.findByText("Name").should("not.exist");
      cy.findByText("Source").should("not.exist");
      cy.findByText("User").should("not.exist");
      cy.findByText("Id").click();

      popover().within(() => {
        cy.get("input").type("1{enter}3{enter}");
        cy.findByText("Add filter").click();
      });

      // verify that the dashcard shows the correct, filtered value
      cy.get(".Card").within(() => {
        cy.contains("2");
      });
    });

    it("should let parameters be locked to a specific value (metabase#20357)", () => {
      visitDashboard(2);
      cy.icon("share").click();
      cy.findByText("Sharing and embedding").click();
      cy.findByText("Embed this dashboard in an application").click();

      cy.findByText("Parameters");
      cy.get(".Modal--full").within(() => {
        cy.findAllByText("Disabled").should("have.length", 4);

        // select the dropdown next to the Id parameter so that we can set it to locked
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
      popover().within(() => {
        cy.get("input").type("1{enter}3{enter}");
      });
      cy.findByText("Add filter").click();

      // publish the embedded dashboard so that we can directly navigate to its url
      cy.findByText("Publish").click();

      // directly navigate to the embedded dashboard
      cy.document().then(doc => {
        const iframe = doc.querySelector("iframe");
        cy.visit(iframe.src);
      });

      // verify that the Id parameter doesn't show up but that its value is reflected in the dashcard
      cy.findByText("Id").should("not.exist");
      cy.get(".Card").within(() => {
        cy.contains("2");
      });
    });
  });

  describe("embedded dashboard", () => {
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

    it("should allow searching PEOPLE.ID by PEOPLE.NAME", () => {
      cy.contains("Id").click();
      popover()
        .find('[placeholder="Search by Name or enter an ID"]')
        .type("Aly");
      popover().contains("Alycia McCullough - 2016");
    });

    it("should allow searching PEOPLE.NAME by PEOPLE.NAME", () => {
      cy.contains("Name").click();
      popover()
        .find('[placeholder="Search by Name"]')
        .type("Aly");
      popover().contains("Alycia McCullough");
    });

    it("should show values for PEOPLE.SOURCE", () => {
      cy.contains("Source").click();
      popover().contains("Affiliate");
    });

    it("should allow searching ORDER.USER_ID by PEOPLE.NAME", () => {
      cy.contains("User").click();
      popover()
        .find('[placeholder="Search by Name or enter an ID"]')
        .type("Aly");
      popover().contains("Alycia McCullough - 2016");
    });

    it("should accept url parameters", () => {
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
