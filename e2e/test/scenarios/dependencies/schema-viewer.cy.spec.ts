const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID, ACCOUNTS_ID } =
  SAMPLE_DATABASE;

const SCHEMA_VIEWER_URL = "/data-studio/schema-viewer";

describe("scenarios > dependencies > Schema Viewer", () => {
  beforeEach(() => {
    H.restore("default");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("navigation", () => {
    it("should show Schema Viewer link in data studio nav and navigate to the page", () => {
      cy.visit("/data-studio/library");
      H.DataStudio.nav()
        .findByRole("link", { name: "Schema viewer" })
        .should("be.visible")
        .click();
      cy.url().should("include", "/data-studio/schema-viewer");
      H.DataStudio.nav()
        .findByRole("link", { name: "Schema viewer" })
        .should("have.attr", "aria-label", "Schema viewer");
    });
  });

  describe("search input", () => {
    it("should search for a table and navigate to its Schema Viewer", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      getEntrySearchInput().should("be.visible");
      getEntrySearchInput().type("Orders");
      H.popover().findByText("Orders").click();
      cy.url().should("include", "table-id=");
      getSchemaNode("ORDERS").should("be.visible");
    });

    it("should search for a model and navigate to its Schema Viewer", () => {
      cy.intercept("GET", "/api/search*").as("searchRequest");
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(SCHEMA_VIEWER_URL);
      getEntrySearchInput().clear().type("Orders Model");
      cy.wait("@searchRequest");
      H.popover().findByText("Orders Model").click();
      cy.url().should("include", "model-id=");
      cy.wait("@erdRequest");
      // model resolves to same underlying table
      getSchemaNode("ORDERS").should("be.visible");
    });

    it("should only show tables and models in Browse all picker", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      getEntrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        // should not show transforms, for example
        cy.findByText("Transforms").should("not.exist");
      });
    });
  });

  describe("page loading", () => {
    it("should show loading state while fetching Schema Viewer data", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", (req) => {
        req.on("response", (res) => {
          res.setDelay(1000);
        });
      }).as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?table-id=${ORDERS_ID}`);
      cy.get(".mb-mantine-Loader-root").should("be.visible");
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");
    });

    it("should show error state when API returns an error", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", {
        statusCode: 500,
        body: { message: "Internal error" },
      }).as("erdError");

      cy.visit(`${SCHEMA_VIEWER_URL}?table-id=${ORDERS_ID}`);
      cy.wait("@erdError");
      cy.get("main").findByText("Failed to load schema.").should("be.visible");
    });

    it("should show empty state when no table-id or model-id is provided", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      cy.get("main")
        .findByText("Search for a table or model to view its schema")
        .should("be.visible");
    });
  });

  describe("model-id support", () => {
    it("should load Schema Viewer via model-id query param and send correct API request", () => {
      H.createQuestion({
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      }).then(({ body: card }) => {
        cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
        cy.visit(`${SCHEMA_VIEWER_URL}?model-id=${card.id}`);
        cy.wait("@erdRequest").then((interception) => {
          expect(interception.request.url).to.include(`model-id=${card.id}`);
          expect(interception.response!.statusCode).to.eq(200);
        });
        getSchemaViewerCanvas().should("be.visible");
        getSchemaNode("ORDERS").should("be.visible");
        getSchemaNode("PEOPLE").should("be.visible");
        getSchemaNode("PRODUCTS").should("be.visible");
      });
    });

    it("should return 400 when model-id points to a non-existent card", () => {
      cy.request({
        method: "GET",
        url: "/api/ee/dependencies/erd?model-id=999999",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.be.oneOf([404, 400]);
      });
    });
  });

  describe("node rendering", () => {
    it("should display the focal table highlighted and its related tables", () => {
      visitSchemaViewer(ORDERS_ID);

      getSchemaNode("ORDERS").should("be.visible");
      getSchemaNode("ORDERS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });

      getSchemaNode("PEOPLE").should("be.visible");
      getSchemaNode("PEOPLE").within(() => {
        cy.get('[class*="focal"]').should("not.exist");
      });

      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should display all fields for the Products table", () => {
      visitSchemaViewer(PRODUCTS_ID);

      getSchemaNode("PRODUCTS").within(() => {
        cy.findByText("ID").should("be.visible");
        cy.findByText("TITLE").should("be.visible");
        cy.findByText("CATEGORY").should("be.visible");
        cy.findByText("VENDOR").should("be.visible");
        cy.findByText("PRICE").should("be.visible");
        cy.findByText("RATING").should("be.visible");
        cy.findByText("EAN").should("be.visible");
        cy.findByText("CREATED_AT").should("be.visible");
      });
    });
  });

  describe("edge rendering", () => {
    it("should display edges connecting Orders to People and Products", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitSchemaViewer(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { edges } = interception.response!.body;
        expect(edges.length).to.be.at.least(2);

        const tableIds = new Set(
          edges.flatMap(
            (e: { source_table_id: number; target_table_id: number }) => [
              e.source_table_id,
              e.target_table_id,
            ],
          ),
        );
        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(PEOPLE_ID)).to.be.true;
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
      });

      getSchemaEdges().should("have.length.at.least", 2);
    });

    it("should show Products with both Orders and Reviews as related", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitSchemaViewer(PRODUCTS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const tableIds = new Set(
          nodes.map((n: { table_id: number }) => n.table_id),
        );
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(REVIEWS_ID)).to.be.true;
      });

      getSchemaNode("PRODUCTS").should("be.visible");
      getSchemaNode("ORDERS").should("be.visible");
      getSchemaNode("REVIEWS").should("be.visible");
    });
  });

  describe("different focal tables", () => {
    it("should display schema for People with Orders as related table", () => {
      visitSchemaViewer(PEOPLE_ID);

      getSchemaNode("PEOPLE").should("be.visible");
      getSchemaNode("PEOPLE").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getSchemaNode("ORDERS").should("be.visible");
    });

    it("should display schema for Reviews with Products as related table", () => {
      visitSchemaViewer(REVIEWS_ID);

      getSchemaNode("REVIEWS").should("be.visible");
      getSchemaNode("REVIEWS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should display schema for Accounts with incoming FK tables", () => {
      visitSchemaViewer(ACCOUNTS_ID);

      getSchemaNode("ACCOUNTS").should("be.visible");
      getSchemaNode("ACCOUNTS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      // Accounts has incoming FKs from analytic_events, feedback, invoices
      getSchemaEdges().should("have.length.at.least", 1);
    });
  });

  describe("permissions", () => {
    it("should require enterprise token for the ERD endpoint", () => {
      H.restore("default");
      cy.signInAsAdmin();
      // Don't activate the enterprise token
      cy.request({
        method: "GET",
        url: `/api/ee/dependencies/erd?table-id=${ORDERS_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(402);
      });
    });

    it("should return an error for a non-existent table-id", () => {
      cy.request({
        method: "GET",
        url: "/api/ee/dependencies/erd?table-id=999999",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.be.oneOf([404, 400]);
      });
    });

    it("should return 400 when neither table-id nor model-id is provided", () => {
      cy.request({
        method: "GET",
        url: "/api/ee/dependencies/erd",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
      });
    });
  });

  describe("layout", () => {
    it("should position nodes at unique locations and fit all in view", () => {
      visitSchemaViewer(ORDERS_ID);

      // Wait for dagre layout to complete
      cy.wait(500);

      cy.get(".react-flow__node").then(($nodes) => {
        const transforms = $nodes.toArray().map((n) => n.style.transform);
        const uniqueTransforms = new Set(transforms);
        expect(uniqueTransforms.size).to.eq($nodes.length);
      });

      // All nodes should be within the visible viewport after fitView
      cy.get(".react-flow__node").each(($node) => {
        cy.wrap($node).should("be.visible");
      });
    });
  });
});

function visitSchemaViewer(tableId: number) {
  cy.visit(`${SCHEMA_VIEWER_URL}?table-id=${tableId}`);
  getSchemaViewerCanvas().should("be.visible");
}

function getSchemaViewerCanvas() {
  return cy.get(".react-flow");
}

function getEntrySearchInput() {
  return cy.findByTestId("graph-entry-search-input");
}

function getSchemaNode(tableName: string) {
  return cy
    .get(".react-flow__node")
    .contains(tableName)
    .closest(".react-flow__node");
}

function getSchemaEdges() {
  return cy.get(".react-flow__edge");
}
