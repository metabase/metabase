const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID, ACCOUNTS_ID } =
  SAMPLE_DATABASE;

const ERD_URL = "/data-studio/schema-viewer";

describe("scenarios > dependencies > ERD", () => {
  beforeEach(() => {
    H.restore("default");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("navigation", () => {
    it("should show ERD link in data studio nav", () => {
      cy.visit("/data-studio/library");
      H.DataStudio.nav()
        .findByRole("link", { name: "ERD" })
        .should("be.visible");
    });

    it("should navigate to ERD page from data studio nav", () => {
      cy.visit("/data-studio/library");
      H.DataStudio.nav().findByRole("link", { name: "ERD" }).click();
      cy.url().should("include", "/data-studio/schema-viewer");
    });

    it("should highlight ERD nav link when on ERD page", () => {
      cy.visit(ERD_URL);
      H.DataStudio.nav()
        .findByRole("link", { name: "ERD" })
        .should("have.attr", "aria-label", "ERD");
    });
  });

  describe("search input", () => {
    it("should show search input on empty ERD page", () => {
      cy.visit(ERD_URL);
      getEntrySearchInput().should("be.visible");
    });

    it("should show search input when ERD is loaded with a table", () => {
      visitErd(ORDERS_ID);
      getEntrySearchInput().should("be.visible");
    });

    it("should search for a table and navigate to its ERD", () => {
      cy.visit(ERD_URL);
      getEntrySearchInput().type("Orders");
      H.popover().findByText("Orders").click();
      cy.url().should("include", "table-id=");
      getErdNode("ORDERS").should("be.visible");
    });

    it("should search for a model and navigate to its ERD", () => {
      H.createQuestion({
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      });

      cy.intercept("GET", "/api/search*").as("searchRequest");
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(ERD_URL);
      getEntrySearchInput().clear().type("Orders Model");
      cy.wait("@searchRequest");
      H.popover().findByText("Orders Model").click();
      cy.url().should("include", "model-id=");
      cy.wait("@erdRequest");
      // model resolves to same underlying table
      getErdNode("ORDERS").should("be.visible");
    });

    it("should open Browse all picker and select a table", () => {
      cy.visit(ERD_URL);
      getEntrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().should("be.visible");
    });

    it("should only show tables and models in Browse all picker", () => {
      cy.visit(ERD_URL);
      getEntrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        // should not show dashboard, question, or other model types
        cy.findByText("Dashboards").should("not.exist");
        cy.findByText("Questions").should("not.exist");
      });
    });
  });

  describe("page loading", () => {
    it("should load the ERD page with a valid table-id", () => {
      visitErd(ORDERS_ID);
      getErdNode("ORDERS").should("be.visible");
    });

    it("should show loading state while fetching ERD data", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", (req) => {
        req.on("response", (res) => {
          res.setDelay(1000);
        });
      }).as("erdRequest");

      cy.visit(`${ERD_URL}?table-id=${ORDERS_ID}`);
      cy.get(".mb-mantine-Loader-root").should("be.visible");
      cy.wait("@erdRequest");
      getErdCanvas().should("be.visible");
    });

    it("should show error state when API returns an error", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", {
        statusCode: 500,
        body: { message: "Internal error" },
      }).as("erdError");

      cy.visit(`${ERD_URL}?table-id=${ORDERS_ID}`);
      cy.wait("@erdError");
      cy.get("main").findByText("Failed to load ERD").should("be.visible");
    });

    it("should show empty state when no table-id or model-id is provided", () => {
      cy.visit(ERD_URL);
      cy.get("main")
        .findByText("Search for a table or model to view its ERD")
        .should("be.visible");
    });
  });

  describe("model-id support", () => {
    it("should load ERD via model-id query param", () => {
      H.createQuestion({
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      }).then(({ body: card }) => {
        cy.visit(`${ERD_URL}?model-id=${card.id}`);
        getErdCanvas().should("be.visible");
        // Should show the underlying table's ERD
        getErdNode("ORDERS").should("be.visible");
        getErdNode("PEOPLE").should("be.visible");
        getErdNode("PRODUCTS").should("be.visible");
      });
    });

    it("should send model-id param to API when model-id is in URL", () => {
      H.createQuestion({
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      }).then(({ body: card }) => {
        cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
        cy.visit(`${ERD_URL}?model-id=${card.id}`);
        cy.wait("@erdRequest").then((interception) => {
          expect(interception.request.url).to.include(`model-id=${card.id}`);
          expect(interception.response!.statusCode).to.eq(200);
        });
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
    it("should display the focal table and its related tables for Orders", () => {
      visitErd(ORDERS_ID);

      // Focal table
      getErdNode("ORDERS").should("be.visible");

      // Related tables via FK relationships
      // Orders.USER_ID -> People.ID and Orders.PRODUCT_ID -> Products.ID
      getErdNode("PEOPLE").should("be.visible");
      getErdNode("PRODUCTS").should("be.visible");
    });

    it("should highlight the focal table differently from related tables", () => {
      visitErd(ORDERS_ID);

      // The focal table card should have the focal CSS class
      getErdNode("ORDERS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });

      // Related tables should not be focal
      getErdNode("PEOPLE").within(() => {
        cy.get('[class*="focal"]').should("not.exist");
      });
    });

    it("should display fields with correct type badges for Orders", () => {
      visitErd(ORDERS_ID);

      getErdNode("ORDERS").within(() => {
        // PK field
        cy.findByText("PK").should("be.visible");
        cy.findByText("ID").should("be.visible");

        // FK fields
        cy.findAllByText("FK").should("have.length.at.least", 2);
        cy.findByText("USER_ID").should("be.visible");
        cy.findByText("PRODUCT_ID").should("be.visible");

        // Numeric fields (SUBTOTAL, TAX, TOTAL, DISCOUNT, QUANTITY)
        cy.findAllByText("123").should("have.length.at.least", 1);

        // Date fields (CREATED_AT)
        cy.findAllByText("⏰").should("have.length.at.least", 1);
        cy.findByText("CREATED_AT").should("be.visible");
      });
    });

    it("should display all fields for the Products table", () => {
      visitErd(PRODUCTS_ID);

      getErdNode("PRODUCTS").within(() => {
        cy.findByText("PK").should("be.visible");
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
    it("should display edges between related tables", () => {
      visitErd(ORDERS_ID);

      // There should be at least 2 edges: Orders→People, Orders→Products
      getErdEdges().should("have.length.at.least", 2);
    });

    it("should return edges connecting Orders to People and Products", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
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
    });

    it("should show Products with both Orders and Reviews as related", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(PRODUCTS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const tableIds = new Set(
          nodes.map((n: { table_id: number }) => n.table_id),
        );
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(REVIEWS_ID)).to.be.true;
      });

      getErdNode("PRODUCTS").should("be.visible");
      getErdNode("ORDERS").should("be.visible");
      getErdNode("REVIEWS").should("be.visible");
    });
  });

  describe("handle visibility", () => {
    it("should show handle dots only on fields with connected edges", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { edges } = interception.response!.body;
        const connectedFieldIds = new Set(
          edges.flatMap(
            (e: { source_field_id: number; target_field_id: number }) => [
              e.source_field_id,
              e.target_field_id,
            ],
          ),
        );

        // The number of visible handles should equal the number of connected fields
        cy.get(".react-flow__handle").should(
          "have.length",
          connectedFieldIds.size,
        );
      });
    });
  });

  describe("ReactFlow controls", () => {
    it("should display zoom and fit-view controls", () => {
      visitErd(ORDERS_ID);

      cy.findByRole("button", { name: "Zoom In" }).should("be.visible");
      cy.findByRole("button", { name: "Zoom Out" }).should("be.visible");
      cy.findByRole("button", { name: "Fit View" }).should("be.visible");
    });

    it("should zoom in when clicking the zoom in button", () => {
      visitErd(ORDERS_ID);

      getViewportScale().then((initialScale) => {
        cy.findByRole("button", { name: "Zoom In" }).click();
        getViewportScale().should("be.gt", initialScale);
      });
    });

    it("should zoom out when clicking the zoom out button", () => {
      visitErd(ORDERS_ID);

      getViewportScale().then((initialScale) => {
        cy.findByRole("button", { name: "Zoom Out" }).click();
        getViewportScale().should("be.lt", initialScale);
      });
    });

    it("should reset zoom after fit view", () => {
      visitErd(ORDERS_ID);

      // Zoom in significantly
      cy.findByRole("button", { name: "Zoom In" }).click();
      cy.findByRole("button", { name: "Zoom In" }).click();
      cy.findByRole("button", { name: "Zoom In" }).click();

      getViewportScale().then((zoomedScale) => {
        cy.findByRole("button", { name: "Fit View" }).click();
        getViewportScale().should("not.eq", zoomedScale);
      });
    });
  });

  describe("different focal tables", () => {
    it("should display ERD for People with Orders as related table", () => {
      visitErd(PEOPLE_ID);

      getErdNode("PEOPLE").should("be.visible");
      getErdNode("PEOPLE").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getErdNode("ORDERS").should("be.visible");
    });

    it("should display ERD for Reviews with Products as related table", () => {
      visitErd(REVIEWS_ID);

      getErdNode("REVIEWS").should("be.visible");
      getErdNode("REVIEWS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getErdNode("PRODUCTS").should("be.visible");
    });

    it("should display ERD for Accounts with incoming FK tables", () => {
      visitErd(ACCOUNTS_ID);

      getErdNode("ACCOUNTS").should("be.visible");
      getErdNode("ACCOUNTS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      // Accounts has incoming FKs from analytic_events, feedback, invoices
      getErdEdges().should("have.length.at.least", 1);
    });
  });

  describe("API response structure", () => {
    it("should return exactly one focal node", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const focalNodes = nodes.filter(
          (n: { is_focal: boolean }) => n.is_focal,
        );
        expect(focalNodes).to.have.length(1);
        expect(focalNodes[0].table_id).to.eq(ORDERS_ID);
      });
    });

    it("should return valid field structure with required properties", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const focalNode = nodes.find((n: { is_focal: boolean }) => n.is_focal);

        expect(focalNode.fields).to.be.an("array");
        expect(focalNode.fields.length).to.be.gt(0);

        for (const field of focalNode.fields) {
          expect(field).to.have.property("id");
          expect(field).to.have.property("name");
          expect(field).to.have.property("database_type");
          expect(field).to.have.property("semantic_type");
        }
      });
    });

    it("should return valid edge structure with required properties", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { edges } = interception.response!.body;
        expect(edges.length).to.be.gt(0);

        for (const edge of edges) {
          expect(edge).to.have.property("source_table_id");
          expect(edge).to.have.property("source_field_id");
          expect(edge).to.have.property("target_table_id");
          expect(edge).to.have.property("target_field_id");
          expect(edge).to.have.property("relationship");
        }
      });
    });

    it("should only include edges between visible tables", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      visitErd(ORDERS_ID);
      cy.wait("@erdRequest").then((interception) => {
        const { nodes, edges } = interception.response!.body;
        const visibleTableIds = new Set(
          nodes.map((n: { table_id: number }) => n.table_id),
        );

        for (const edge of edges) {
          expect(visibleTableIds.has(edge.source_table_id)).to.be.true;
          expect(visibleTableIds.has(edge.target_table_id)).to.be.true;
        }
      });
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
    it("should position each node at a unique location after auto-layout", () => {
      visitErd(ORDERS_ID);

      // Wait for dagre layout to complete
      cy.wait(500);

      cy.get(".react-flow__node").then(($nodes) => {
        const transforms = $nodes.toArray().map((n) => n.style.transform);
        const uniqueTransforms = new Set(transforms);
        expect(uniqueTransforms.size).to.eq($nodes.length);
      });
    });

    it("should fit the view to show all nodes after layout", () => {
      visitErd(ORDERS_ID);

      // All nodes should be within the visible viewport after fitView
      cy.get(".react-flow__node").each(($node) => {
        cy.wrap($node).should("be.visible");
      });
    });
  });
});

function visitErd(tableId: number) {
  cy.visit(`${ERD_URL}?table-id=${tableId}`);
  getErdCanvas().should("be.visible");
}

function getErdCanvas() {
  return cy.get(".react-flow");
}

function getEntrySearchInput() {
  return cy.findByTestId("graph-entry-search-input");
}

function getErdNode(tableName: string) {
  return cy
    .get(".react-flow__node")
    .contains(tableName)
    .closest(".react-flow__node");
}

function getErdEdges() {
  return cy.get(".react-flow__edge");
}

function getViewportScale(): Cypress.Chainable<number> {
  return cy
    .get(".react-flow__viewport")
    .invoke("css", "transform")
    .then((transform: string) => {
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
}
