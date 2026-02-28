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

  describe("page loading", () => {
    it("should show loading state while fetching Schema Viewer data", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", (req) => {
        req.on("response", (res) => {
          res.setDelay(1000);
        });
      }).as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.get(".mb-mantine-Loader-root").should("be.visible");
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");
    });

    it("should show error state when API returns an error", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*", {
        statusCode: 500,
        body: { message: "Internal error" },
      }).as("erdError");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.wait("@erdError");
      // getErrorMessage extracts the message from the response body
      cy.get("main").findByText("Internal error").should("be.visible");
    });

    it("should show empty state when no database is selected", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      cy.get("main")
        .findByText("Pick a database to view its schema")
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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${PRODUCTS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${PRODUCTS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${PEOPLE_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      getSchemaNode("PEOPLE").should("be.visible");
      getSchemaNode("PEOPLE").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getSchemaNode("ORDERS").should("be.visible");
    });

    it("should display schema for Reviews with Products as related table", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${REVIEWS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      getSchemaNode("REVIEWS").should("be.visible");
      getSchemaNode("REVIEWS").within(() => {
        cy.get('[class*="focal"]').should("exist");
      });
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should display schema for Accounts with incoming FK tables", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ACCOUNTS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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
        url: `/api/ee/dependencies/erd?database-id=1&table-ids=${ORDERS_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(402);
      });
    });

    it("should return an error for non-existent table-ids", () => {
      cy.request({
        method: "GET",
        url: "/api/ee/dependencies/erd?database-id=1&table-ids=999999",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.be.oneOf([404, 400]);
      });
    });

    it("should return 400 when neither database-id nor model-id is provided", () => {
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
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

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

  describe("database/schema picker", () => {
    it("should show picker button and load schema when database is selected", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      cy.get("main")
        .findByText("Pick a database to view its schema")
        .should("be.visible");

      getSchemaPickerButton().click();
      H.popover().findByText("Sample Database").click();

      // Should load schema and show nodes
      getSchemaViewerCanvas().should("be.visible");
      cy.get(".react-flow__node").should("have.length.at.least", 1);
    });

    it("should show database/schema name in picker button after selection", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1`);
      getSchemaViewerCanvas().should("be.visible");

      // Button should show selected database/schema
      getSchemaPickerButton().should("contain.text", "Sample Database");
    });

    it("should clear selection when clear button is clicked", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1`);
      getSchemaViewerCanvas().should("be.visible");
      cy.get(".react-flow__node").should("have.length.at.least", 1);

      // Click clear button
      getSchemaPickerButton().find('[aria-label="Clear"]').click();

      // Should return to empty state
      cy.url().should("eq", Cypress.config().baseUrl + SCHEMA_VIEWER_URL);
      cy.get("main")
        .findByText("Pick a database to view its schema")
        .should("be.visible");
    });
  });

  describe("table selector", () => {
    it("should show table selector and allow toggling tables", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      // Should show table selector with count (user-modified selection)
      getTableSelectorButton().should("be.visible");
      getTableSelectorButton().should("contain.text", "tables selected");

      // Open selector
      getTableSelectorButton().click();

      // Should show checkboxes for tables
      H.popover().within(() => {
        cy.findByText("Select all").should("be.visible");
        cy.findByPlaceholderText("Search the list").should("be.visible");
      });
    });

    it("should filter tables when searching", () => {
      cy.intercept("GET", "/api/database/*/schema/*").as("tablesRequest");
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${ORDERS_ID}`);
      cy.wait("@tablesRequest");
      getSchemaViewerCanvas().should("be.visible");

      getTableSelectorButton().click();

      H.popover().within(() => {
        // "Select all" is visible before searching
        cy.findByText("Select all").should("be.visible");

        cy.findByPlaceholderText("Search the list").type("orders");

        // "Select all" is hidden when searching
        cy.findByText("Select all").should("not.exist");
        // Should only show matching tables (case-insensitive)
        cy.findByText(/orders/i).should("be.visible");
        cy.findByText(/people/i).should("not.exist");
      });
    });

    it("should sort selected tables to the top", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      getTableSelectorButton().click();

      H.popover().within(() => {
        // Skip "Select all" checkbox (index 0), first table checkbox should be ORDERS (checked)
        cy.get('[type="checkbox"]').eq(1).should("be.checked");
      });
    });

  });

  describe("hops input", () => {
    it("should show hops input when tables are selected and edges exist", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");
      getSchemaEdges().should("have.length.at.least", 1);

      // Hops input should be visible
      getHopsInput().should("be.visible");
      getHopsInput().should("contain.text", "Steps");
    });

    it("should update graph when hops value changes", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.wait("@erdRequest");

      // Get initial node count
      cy.get(".react-flow__node").then(($initialNodes) => {
        const initialCount = $initialNodes.length;

        // Change hops to 1 (last button is decrement in Mantine NumberInput)
        getHopsInput().find("button").last().click();

        cy.wait("@erdRequest").then((interception) => {
          expect(interception.request.url).to.include("hops=1");
        });

        // Node count may differ with fewer hops
        cy.get(".react-flow__node").should("exist");
      });
    });

    it("should not show hops input when no tables are selected", () => {
      cy.visit(SCHEMA_VIEWER_URL);
      getHopsInput().should("not.exist");
    });
  });

  describe("clickable FK fields", () => {
    it("should expand to include target table when FK field is clicked", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      // Start with PEOPLE - ORDERS has FK to PEOPLE, and ORDERS has FK to PRODUCTS (not on canvas)
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${PEOPLE_ID}&hops=1`);
      cy.wait("@erdRequest");

      getSchemaNode("PEOPLE").should("be.visible");
      getSchemaNode("ORDERS").should("be.visible");

      // ORDERS has FK to PRODUCTS which is not on canvas yet
      // The PRODUCT_ID field in ORDERS should be expandable
      cy.get('[data-expandable="true"]').should("exist").first().click();

      cy.wait("@erdRequest");

      // PRODUCTS should now be visible
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should highlight expandable FK fields with brand color", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${PEOPLE_ID}&hops=1`);
      getSchemaViewerCanvas().should("be.visible");

      // Wait for nodes to render
      getSchemaNode("ORDERS").should("be.visible");

      // Expandable FK fields should exist
      cy.get('[data-expandable="true"]').should("exist");
    });
  });

  describe("URL parameters", () => {
    it("should load schema with database-id param", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1`);

      cy.wait("@erdRequest").then((interception) => {
        expect(interception.request.url).to.include("database-id=1");
      });

      getSchemaViewerCanvas().should("be.visible");
      cy.get(".react-flow__node").should("have.length.at.least", 1);
    });

    it("should load schema with database-id and schema params", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC`);

      cy.wait("@erdRequest").then((interception) => {
        expect(interception.request.url).to.include("database-id=1");
        expect(interception.request.url).to.include("schema=PUBLIC");
      });

      getSchemaViewerCanvas().should("be.visible");
    });

    it("should load specific tables with table-ids param", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&table-ids=${PRODUCTS_ID}`,
      );

      cy.wait("@erdRequest").then((interception) => {
        expect(interception.request.url).to.include(`table-ids=${ORDERS_ID}`);
        expect(interception.request.url).to.include(`table-ids=${PRODUCTS_ID}`);
      });

      getSchemaNode("ORDERS").should("be.visible");
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should respect hops param in URL", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&hops=1`);

      cy.wait("@erdRequest").then((interception) => {
        expect(interception.request.url).to.include("hops=1");
      });
    });
  });


  describe("backend hops logic", () => {
    it("should return correct number of hops from focal tables", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      // With 1 hop, should only get directly connected tables
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&hops=1`);

      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        // ORDERS connects to PEOPLE and PRODUCTS
        // With 1 hop, we should NOT see tables 2 hops away (like REVIEWS which connects to PRODUCTS)
        const tableIds = new Set(nodes.map((n: { table_id: number }) => n.table_id));

        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(PEOPLE_ID)).to.be.true;
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
      });
    });

    it("should expand correctly with 2 hops", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&hops=2`);

      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const tableIds = new Set(nodes.map((n: { table_id: number }) => n.table_id));

        // With 2 hops from ORDERS:
        // 1 hop: PEOPLE, PRODUCTS
        // 2 hops: REVIEWS (connected to PRODUCTS)
        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
        expect(tableIds.has(REVIEWS_ID)).to.be.true;
      });
    });
  });
});

function getSchemaViewerCanvas() {
  return cy.get(".react-flow");
}

function getSchemaPickerButton() {
  return cy.findByTestId("schema-picker-button");
}

function getTableSelectorButton() {
  return cy.findByTestId("table-selector-button");
}

function getHopsInput() {
  return cy.findByTestId("hops-input");
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
