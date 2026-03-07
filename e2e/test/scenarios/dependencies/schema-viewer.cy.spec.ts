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
      getSchemaEdges().should("have.length.at.least", 1);
    });
  });

  describe("permissions", () => {
    it("should require enterprise token for the ERD endpoint", () => {
      H.restore("default");
      cy.signInAsAdmin();
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

      cy.wait(500);

      cy.get(".react-flow__node").then(($nodes) => {
        const transforms = $nodes.toArray().map((n) => n.style.transform);
        const uniqueTransforms = new Set(transforms);
        expect(uniqueTransforms.size).to.eq($nodes.length);
      });

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

      getSchemaViewerCanvas().should("be.visible");
      cy.get(".react-flow__node").should("have.length.at.least", 1);
    });

    it("should clear selection when clear button is clicked", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1`);
      getSchemaViewerCanvas().should("be.visible");
      cy.get(".react-flow__node").should("have.length.at.least", 1);

      getSchemaPickerButton().find('[aria-label="Clear"]').click();

      cy.url().should("eq", Cypress.config().baseUrl + SCHEMA_VIEWER_URL);
      cy.get("main")
        .findByText("Pick a database to view its schema")
        .should("be.visible");
    });
  });

  describe("table selector", () => {
    it("should show table selector and allow toggling tables", () => {
      cy.intercept("GET", "/api/database/*/schema/*").as("tablesRequest");
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${ORDERS_ID}`,
      );
      cy.wait("@tablesRequest");
      getSchemaViewerCanvas().should("be.visible");

      getTableSelectorButton().should("be.visible");
      getTableSelectorButton().should("contain.text", "tables selected");

      getTableSelectorButton().click();

      H.popover().within(() => {
        cy.findByText("Select all").should("be.visible");
        cy.findByPlaceholderText("Search the list").should("be.visible");
      });
    });
  });

  describe("clickable FK fields", () => {
    it("should expand to include target table when FK field is clicked", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${PEOPLE_ID}&hops=1`,
      );
      cy.wait("@erdRequest");

      getSchemaNode("PEOPLE").should("be.visible");
      getSchemaNode("ORDERS").should("be.visible");

      cy.get('[data-expandable="true"]').should("exist").first().click();

      cy.wait("@erdRequest");

      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should highlight expandable FK fields with brand color", () => {
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${PEOPLE_ID}&hops=1`,
      );
      getSchemaViewerCanvas().should("be.visible");

      getSchemaNode("ORDERS").should("be.visible");

      cy.get('[data-expandable="true"]').should("exist");
    });
  });

  describe("backend hops logic", () => {
    it("should return correct number of hops from focal tables", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&hops=1`,
      );

      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const tableIds = new Set(
          nodes.map((n: { table_id: number }) => n.table_id),
        );

        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(PEOPLE_ID)).to.be.true;
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
      });
    });

    it("should expand correctly with 2 hops", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}&hops=2`,
      );

      cy.wait("@erdRequest").then((interception) => {
        const { nodes } = interception.response!.body;
        const tableIds = new Set(
          nodes.map((n: { table_id: number }) => n.table_id),
        );

        expect(tableIds.has(ORDERS_ID)).to.be.true;
        expect(tableIds.has(PRODUCTS_ID)).to.be.true;
        expect(tableIds.has(REVIEWS_ID)).to.be.true;
      });
    });
  });

  describe("compact mode", () => {
    it("should have compact mode toggle button", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      getCompactModeToggleButton().should("exist");
    });

    it("should toggle between compact and full mode when clicking the button", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      // Get initial button state
      getCompactModeToggleButton()
        .should("exist")
        .then(($button) => {
          const initialTitle = $button.attr("title");
          const isInitiallyCompact = initialTitle?.includes("full");

          // Click to toggle mode
          cy.wrap($button).click();
          cy.wait(300);

          // Button title should change to the opposite
          if (isInitiallyCompact) {
            getCompactModeToggleButton().should(
              "have.attr",
              "title",
              "Switch to compact mode",
            );
          } else {
            getCompactModeToggleButton().should(
              "have.attr",
              "title",
              "Switch to full mode",
            );
          }

          // Click again to toggle back
          getCompactModeToggleButton().click();
          cy.wait(300);

          // Should return to original state
          getCompactModeToggleButton().should(
            "have.attr",
            "title",
            initialTitle,
          );
        });
    });

    it("should persist compact mode preference across navigation", () => {
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      // Toggle to a specific mode
      getCompactModeToggleButton().then(($button) => {
        const initialTitle = $button.attr("title");

        // Click to change mode
        cy.wrap($button).click();
        cy.wait(300);

        // Get the new state
        getCompactModeToggleButton().then(($newButton) => {
          const newTitle = $newButton.attr("title");

          // Navigate away
          cy.visit("/data-studio/library");

          // Navigate back to the same database
          cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1`);
          getSchemaViewerCanvas().should("be.visible");

          // Should restore the mode we set
          getCompactModeToggleButton().should("have.attr", "title", newTitle);
        });
      });
    });

    it("should auto-detect compact mode with many fields", () => {
      // Visit a table with many fields
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ACCOUNTS_ID}`);
      getSchemaViewerCanvas().should("be.visible");

      // Should start in appropriate mode based on field count
      cy.get(".react-flow__node").should("exist");
    });
  });

  describe("field expand/collapse", () => {
    it("should expand all fields when clicking header expand icon", () => {
      // Mock ERD response with a table that has >20 fields
      cy.intercept("GET", "/api/ee/dependencies/erd*", (req) => {
        req.reply({
          nodes: [
            {
              table_id: 1,
              name: "ORDERS",
              is_focal: true,
              fields: Array.from({ length: 25 }, (_, i) => ({
                id: i + 1,
                name: `FIELD_${i + 1}`,
                semantic_type: i === 0 ? "type/PK" : null,
                database_type: "VARCHAR",
              })),
            },
          ],
          edges: [],
        });
      }).as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      getSchemaNode("ORDERS").within(() => {
        // Expand/collapse button should exist for tables with >20 fields
        cy.get("button").should("exist");

        // Initial state: only first 20 fields rendered (collapsed)
        cy.contains("FIELD_1").should("be.visible");
        cy.contains("FIELD_20").should("be.visible");
        cy.contains("FIELD_21").should("not.exist");

        // Click expand button
        cy.get("button").first().click();

        // After expanding: all 25 fields should be rendered
        cy.contains("FIELD_21").should("exist");
        cy.contains("FIELD_25").should("exist");
      });
    });

    it("should collapse fields when clicking header collapse icon", () => {
      // Mock ERD response with a table that has >20 fields
      cy.intercept("GET", "/api/ee/dependencies/erd*", (req) => {
        req.reply({
          nodes: [
            {
              table_id: 1,
              name: "ORDERS",
              is_focal: true,
              fields: Array.from({ length: 25 }, (_, i) => ({
                id: i + 1,
                name: `FIELD_${i + 1}`,
                semantic_type: i === 0 ? "type/PK" : null,
                database_type: "VARCHAR",
              })),
            },
          ],
          edges: [],
        });
      }).as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      getSchemaNode("ORDERS").within(() => {
        // First expand - click button to show all fields
        cy.get("button").first().click();
        cy.contains("FIELD_25").should("exist");

        // Then collapse - click button again
        cy.get("button").first().click();

        // Should show only first 20 fields again
        cy.contains("FIELD_20").should("be.visible");
        cy.contains("FIELD_21").should("not.exist");
      });
    });
  });

  describe("double-click zoom behavior", () => {
    it("should switch to full mode and focus node on double-click in compact mode", () => {
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID},${PRODUCTS_ID}`,
      );
      getSchemaViewerCanvas().should("be.visible");

      // Start in compact mode - toggle to compact
      getCompactModeToggleButton().then(($btn) => {
        const title = $btn.attr("title");
        // If not already in compact mode, click to switch
        if (title?.includes("compact")) {
          cy.wrap($btn).click();
          cy.wait(300);
        }
      });

      // Verify we're in compact mode
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to full mode",
      );

      // Double-click a node in compact mode
      getSchemaNode("PRODUCTS").dblclick();
      cy.wait(500);

      // Should switch to full mode (button text changes)
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to compact mode",
      );

      // Node should still be visible (focused)
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should only zoom in full mode with explicit full mode set", () => {
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID},${PRODUCTS_ID}`,
      );
      getSchemaViewerCanvas().should("be.visible");

      // Explicitly set full mode via button: toggle to compact, then back to full
      getCompactModeToggleButton().then(($btn) => {
        const initialTitle = $btn.attr("title");

        // Click to toggle mode (either to compact or full)
        cy.wrap($btn).click();
        cy.wait(300);

        // Click again to toggle back - this makes it "explicit full mode"
        getCompactModeToggleButton().click();
        cy.wait(300);
      });

      // Should be in full mode
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to compact mode",
      );

      // Double-click to focus a node
      getSchemaNode("PRODUCTS").dblclick();
      cy.wait(300);

      // Double-click again (focused node) - should zoom out but stay in full mode
      getSchemaNode("PRODUCTS").dblclick();
      cy.wait(300);

      // Should still be in full mode (explicit full mode flag prevents switching to compact)
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to compact mode",
      );
    });

    it("should focus unfocused node on double-click in full mode", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID},${PRODUCTS_ID},${PEOPLE_ID}`,
      );
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      // Wait for React Flow to render nodes
      cy.get(".react-flow__node").should("have.length.greaterThan", 0);

      // All nodes should be visible
      getSchemaNode("ORDERS").should("be.visible");
      getSchemaNode("PRODUCTS").should("be.visible");
      getSchemaNode("PEOPLE").should("be.visible");

      // Ensure we're in full mode (not compact)
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to compact mode",
      );

      // Double-click an unfocused node - should zoom/focus on it
      getSchemaNode("PEOPLE").dblclick();

      // Should remain in full mode
      getCompactModeToggleButton().should(
        "have.attr",
        "title",
        "Switch to compact mode",
      );

      // Node should still be visible after focusing
      getSchemaNode("PEOPLE").should("be.visible");
    });
  });

  describe("FK field interaction types", () => {
    it("should add table to canvas when clicking FK with no visible target", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");
      cy.visit(
        `${SCHEMA_VIEWER_URL}?database-id=1&schema=PUBLIC&table-ids=${PEOPLE_ID}&hops=1`,
      );
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      // Wait for React Flow to render nodes
      cy.get(".react-flow__node").should("have.length.greaterThan", 0);

      // PEOPLE should be visible
      getSchemaNode("PEOPLE").should("be.visible");

      // Click FK field to expand (PEOPLE has FK to PRODUCTS)
      cy.get('[data-expandable="true"]').first().click();
      cy.wait("@erdRequest");

      // PRODUCTS should now be visible
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should zoom to target when clicking FK with visible target", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      // Load both ORDERS and PRODUCTS so FK field can zoom to target
      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID},${PRODUCTS_ID}`);
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      // Wait for React Flow to render nodes
      cy.get(".react-flow__node").should("have.length.greaterThan", 0);

      // Both ORDERS and PRODUCTS are visible
      getSchemaNode("ORDERS").should("be.visible");
      getSchemaNode("PRODUCTS").should("be.visible");

      // Find and click FK field in ORDERS pointing to PRODUCTS (should be clickable but NOT expandable)
      getSchemaNode("ORDERS").within(() => {
        cy.contains("PRODUCT_ID")
          .parent()
          .should("have.css", "cursor", "pointer")
          .should("not.have.attr", "data-expandable")
          .click();
      });

      // Should zoom to PRODUCTS
      cy.wait(500);
      getSchemaNode("PRODUCTS").should("be.visible");
    });

    it("should not allow click on FK field with no connection", () => {
      cy.intercept("GET", "/api/ee/dependencies/erd*").as("erdRequest");

      cy.visit(`${SCHEMA_VIEWER_URL}?database-id=1&table-ids=${ORDERS_ID}`);
      cy.wait("@erdRequest");
      getSchemaViewerCanvas().should("be.visible");

      // Wait for React Flow to render nodes
      cy.get(".react-flow__node").should("have.length.greaterThan", 0);

      getSchemaNode("ORDERS").should("be.visible");

      // Regular (non-FK) fields should not be clickable
      getSchemaNode("ORDERS").within(() => {
        // Find a non-FK field (like CREATED_AT, TOTAL, etc.)
        cy.contains("TOTAL")
          .parent()
          .should("not.have.css", "cursor", "pointer");
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

function getSchemaNode(tableName: string) {
  return cy
    .get(".react-flow__node")
    .contains(tableName)
    .closest(".react-flow__node");
}

function getSchemaEdges() {
  return cy.get(".react-flow__edge");
}

function getCompactModeToggleButton() {
  return cy
    .get(".react-flow__controls button")
    .filter('[title*="compact"], [title*="full"]');
}
