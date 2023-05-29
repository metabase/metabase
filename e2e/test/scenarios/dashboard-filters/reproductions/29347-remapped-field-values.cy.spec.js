import {
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const filterValue = 100;

const filterDetails = {
  name: "Text",
  slug: "text",
  id: "11d79abe",
  type: "string/=",
  sectionId: "string",
};

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
  },
};

const editableDashboardDetails = {
  parameters: [filterDetails],
  enable_embedding: true,
  embedding_params: {
    [filterDetails.slug]: "enabled",
  },
};

const lockedDashboardDetails = {
  parameters: [filterDetails],
  enable_embedding: true,
  embedding_params: {
    [filterDetails.slug]: "locked",
  },
};

describe("issues 29347, 29346", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    addFieldRemapping(ORDERS.QUANTITY);
  });

  describe("regular dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/dashboard/*").as("dashboard");
      cy.intercept("POST", "/api/dashboard/**/card/*/query").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => visitDashboard(dashboardId));
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId, {
          params: { [filterDetails.slug]: filterValue },
        });
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });

  describe("embedded dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId =>
        visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {},
        }),
      );
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the token (metabase#29347, metabase#29346)", () => {
      createDashboard({ dashboardDetails: lockedDashboardDetails });
      cy.get("@dashboardId").then(dashboardId => {
        visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {
            [filterDetails.slug]: filterValue,
          },
        });
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedCardValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => {
        visitEmbeddedPage(
          {
            resource: { dashboard: dashboardId },
            params: {},
          },
          {
            setFilters: `${filterDetails.slug}=${filterValue}`,
          },
        );
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });

  describe("public dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/public/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/public/dashboard/**/card/*").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId =>
        visitPublicDashboard(dashboardId),
      );
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => {
        visitPublicDashboard(dashboardId, {
          params: { [filterDetails.slug]: filterValue },
        });
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });
});

const getRemappedValue = fieldValue => {
  return `N${fieldValue}`;
};

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
        values: values.map(([value]) => [value, getRemappedValue(value)]),
      });
    },
  );
};

const createDashboard = ({
  dashboardDetails = editableDashboardDetails,
} = {}) => {
  cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
    ({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 24,
            size_y: 13,
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

const filterOnRemappedValues = fieldValue => {
  filterWidget().within(() => {
    cy.findByText(filterDetails.name).click();
  });

  popover().within(() => {
    cy.findByText(getRemappedValue(fieldValue)).click();
    cy.button("Add filter").click();
  });
};

const verifyRemappedValues = fieldValue => {
  verifyRemappedFilterValues(filterValue);
  verifyRemappedCardValues(fieldValue);
};

const verifyRemappedFilterValues = fieldValue => {
  filterWidget().within(() => {
    cy.findByText(getRemappedValue(fieldValue)).should("be.visible");
  });
};

const verifyRemappedCardValues = fieldValue => {
  getDashboardCard().within(() => {
    cy.findAllByText(getRemappedValue(fieldValue)).should("have.length", 2);
  });
};
