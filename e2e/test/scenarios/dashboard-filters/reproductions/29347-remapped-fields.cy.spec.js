import {
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
  },
};

const filterDetails = {
  name: "Text",
  slug: "text",
  id: "11d79abe",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [filterDetails],
};

describe("issue 29347", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    addFieldRemapping(ORDERS.QUANTITY);
    createDashboard();
    cy.intercept("GET", "/api/dashboard/*").as("dashboard");
    cy.intercept("POST", "/api/dashboard/**/query").as("cardQuery");
  });

  it("should be able to filter based on remapped values (metabase#29347)", () => {
    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
      cy.wait("@cardQuery");
    });

    filterWidget().within(() => {
      cy.findByText(filterDetails.name).click();
    });
    popover().within(() => {
      cy.findByText("N100").click();
      cy.button("Add filter").click();
      cy.wait("@cardQuery");
    });
    getDashboardCard().within(() => {
      cy.findAllByText("N100").should("have.length", 2);
    });
  });

  it("should accept remapped values from the url (metabase#29347)", () => {
    cy.get("@dashboardId").then(id => {
      cy.visit(`/dashboard/${id}?${filterDetails.slug}=100`);
      cy.wait("@dashboard");
      cy.wait("@cardQuery");
    });

    filterWidget().within(() => {
      cy.findByText("N100").should("be.visible");
    });
    getDashboardCard().within(() => {
      cy.findAllByText("N100").should("have.length", 2);
    });
  });
});

const addFieldRemapping = fieldId => {
  cy.request("PUT", `/api/field/${fieldId}`, {
    semantic_type: "type/Category",
  });

  cy.request("POST", `/api/field/${fieldId}/dimension`, {
    name: "Quantity",
    type: "internal",
  });

  cy.request("GET", `/api/field/${fieldId}/values`).then(
    ({ body: { values } }) => {
      cy.request("POST", `/api/field/${fieldId}/values`, {
        values: values.map(([value]) => [value, `N${value}`]),
      });
    },
  );
};

const createDashboard = () => {
  cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
    ({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 18,
            size_y: 10,
            parameter_mappings: [
              {
                parameter_id: filterDetails.id,
                card_id,
                target: ["dimension", ["field", ORDERS.QUANTITY, null]],
              },
            ],
          },
        ],
      });

      cy.wrap(dashboard_id).as("dashboardId");
    },
  );
};
