const { H } = cy;
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no segments", () => {
    it("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/segments");

      cy.log("should initially show no segments in UI");
      cy.get("main").findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      );

      cy.button("New segment").click();

      cy.findByTestId("segment-editor").findByText("Select a table").click();
      H.entityPickerModal().within(() => {
        cy.findByText("Orders").click();
      });

      cy.findByTestId("segment-editor").findByText("Orders").should("exist");

      cy.findByTestId("segment-editor")
        .findByText("Add filters to narrow your answer")
        .click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      H.popover().findByText("Custom Expression");
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Segments are interesting subsets of tables");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Learn how to create segments");
    });
  });

  describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";

    beforeEach(() => {
      // Create a segment through API
      H.createSegment({
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      }).then(({ body }) => {
        cy.wrap(body.id).as("segmentId");
      });
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(SEGMENT_NAME);

      // Detail view
      cy.visit("/reference/segments/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Description");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment");

      // Segment fields
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Fields in this segment").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Fields in ${SEGMENT_NAME}`);
      cy.findAllByText("Discount");
    });

    it("should not crash when editing field in segment field detail page (metabase#55322)", () => {
      cy.get("@segmentId").then((segmentId) => {
        cy.visit(`/reference/segments/${segmentId}/fields/${ORDERS.TAX}`);
      });

      cy.button(/Edit/).should("be.visible").realClick();

      cy.findByPlaceholderText("No description yet").should("be.visible");
      cy.get("main").findByText("Something’s gone wrong").should("not.exist");
    });

    it("should show up in UI list and should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segments");

      cy.findByRole("table").within(() => {
        cy.findByText("Filtered by Total is less than 100").should(
          "be.visible",
        );
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
      cy.findByRole("link", { name: /Orders < 100/ })
        .should("be.visible")
        .click();

      cy.get("form").within(() => {
        cy.findByText("Edit Your Segment").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
      cy.findByPlaceholderText("Something descriptive but not too long").should(
        "have.value",
        SEGMENT_NAME,
      );
      cy.findByRole("link", { name: "Preview" }).should("be.visible");
    });

    it("should see a newly asked question in its questions list", () => {
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("main").should("contain", `Questions about ${SEGMENT_NAME}`);
      cy.findByRole("status")
        .as("emptyStateMessage")
        .should(
          "have.text",
          "Questions about this segment will appear here as they're added",
        );

      cy.button("Ask a question").click();
      cy.findByTestId("filter-pill").should("have.text", "Orders < 100");
      cy.findAllByTestId("cell-data").should("contain", "37.65");

      H.summarize();
      cy.findAllByTestId("sidebar-right").button("Done").click();
      cy.findByTestId("scalar-value").should("have.text", "13,005");
      H.saveQuestion("Foo");

      // Check list
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("@emptyStateMessage").should("not.exist");
      cy.findByTestId("data-reference-list-item")
        .findByText("Foo")
        .should("be.visible");
    });

    it("should update that segment", () => {
      cy.visit("/admin");
      cy.findByTestId("admin-navbar-items").contains("Table Metadata").click();
      cy.get("label").contains("Segments").click();

      cy.findByTestId("segment-list-app")
        .contains(SEGMENT_NAME)
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      H.popover().contains("Edit Segment").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /segment\/1$/);
      cy.get("label").contains("Edit Your Segment");
      cy.findByTestId("filter-pill")
        .contains(/Total\s+is less than/)
        .click();
      H.popover().findByLabelText("Filter operator").click();
      H.popover().contains("Greater than").click();
      H.popover().findByPlaceholderText("Enter a number").type("{SelectAll}10");
      H.popover().contains("Update filter").click();

      // confirm that the preview updated
      cy.findByTestId("segment-editor").contains("18758 rows");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]').clear().type("Orders > 10");
      cy.get('[name="description"]')
        .clear()
        .type("All orders with a total over $10.");
      cy.get('[name="revision_message"]').type("time for a change");
      cy.findByTestId("field-set-content").findByText("Save changes").click();

      // get redirected to previous page and see the new segment name
      cy.url().should("match", /datamodel\/segments$/);

      cy.findByTestId("segment-list-app").findByText("Orders > 10");

      // clean up
      cy.findByTestId("segment-list-app")
        .contains("Orders > 10")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      H.popover().findByText("Retire Segment").click();
      H.modal().find("textarea").type("delete it");
      H.modal().contains("button", "Retire").click();
    });

    it("should show segment revision history (metabase#45577, metabase#45594)", () => {
      cy.request("PUT", "/api/segment/1", {
        description: "Medium orders",
        revision_message: "Foo",
      });

      cy.log("Make sure revisions are displayed properly in /references");
      cy.visit("/reference/segments/1/revisions");
      cy.findByTestId("segment-revisions").within(() => {
        cy.findByText(`Revision history for ${SEGMENT_NAME}`).should(
          "be.visible",
        );

        assertRevisionHistory();
      });

      cy.log(
        "Make sure revisions are displayed properly in admin table metadata",
      );
      cy.visit("/admin/datamodel/segments");
      cy.get("tr")
        .filter(`:contains(${SEGMENT_NAME})`)
        .icon("ellipsis")
        .click();
      H.popover().findByTextEnsureVisible("Revision History").click();

      cy.location("pathname").should(
        "eq",
        "/admin/datamodel/segment/1/revisions",
      );

      cy.findByTestId("segment-revisions").within(() => {
        // metabase#45594
        cy.findByRole("heading", {
          name: `Revision History for "${SEGMENT_NAME}"`,
        }).should("be.visible");

        assertRevisionHistory();
      });

      cy.findByTestId("breadcrumbs").within(() => {
        cy.findByText("Segment History");
        cy.findByRole("link", { name: "Segments" }).click();
      });

      cy.location("pathname").should("eq", "/admin/datamodel/segments");
      cy.location("search").should("eq", `?table=${ORDERS_ID}`);

      function assertRevisionHistory() {
        cy.findAllByRole("listitem").as("revisions").should("have.length", 2);
        cy.get("@revisions")
          .first()
          .should("contain", "You edited the description")
          .and("contain", "Foo");
        // eslint-disable-next-line no-unsafe-element-filtering
        cy.get("@revisions")
          .last()
          .should("contain", `You created "${SEGMENT_NAME}"`)
          .and("contain", "All orders with a total under $100.");
      }
    });
  });
});

describe("scenarios > admin > databases > table", () => {
  function turnTableVisibilityOff(table_id) {
    cy.request("PUT", "/api/table", {
      ids: [table_id],
      visibility_type: "hidden",
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should see 8 tables in sample database", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    cy.findAllByTestId("admin-metadata-table-list-item").should(
      "have.length",
      8,
    );
  });

  it("should be able to see details of each table", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    );

    // Orders
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    ).should("not.exist");
    cy.get(
      "input[value='Confirmed Sample Company orders for a product, from a user.']",
    );
  });

  it("should show 404 if database does not exist (metabase#14652)", () => {
    cy.visit("/admin/datamodel/database/54321");
    cy.findAllByTestId("admin-metadata-table-list-item").should(
      "have.length",
      0,
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database");
  });

  describe("in orders table", () => {
    beforeEach(() => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      );
    });

    it("should see multiple fields", () => {
      cy.findByTestId("column-ID")
        .scrollIntoView()
        .within(() => {
          cy.findByText("BIGINT").should("be.visible");
          cy.findByPlaceholderText("Select a semantic type").should(
            "have.value",
            "Entity Key",
          );
        });

      cy.findByTestId("column-USER_ID")
        .scrollIntoView()
        .within(() => {
          cy.findByText("INTEGER").should("be.visible");
          cy.findByPlaceholderText("Select a semantic type").should(
            "have.value",
            "Foreign Key",
          );
          cy.findByPlaceholderText("Select a target").should(
            "have.value",
            "People → ID",
          );
        });

      cy.findByTestId("column-TAX")
        .scrollIntoView()
        .within(() => {
          cy.findByText("DOUBLE PRECISION").should("be.visible");
          cy.findByPlaceholderText("Select a semantic type").should(
            "have.value",
            "No semantic type",
          );
        });

      cy.findByTestId("column-DISCOUNT")
        .scrollIntoView()
        .within(() => {
          cy.findByText("DOUBLE PRECISION").should("be.visible");
          cy.findByPlaceholderText("Select a semantic type").should(
            "have.value",
            "Discount",
          );
        });

      cy.findByTestId("column-CREATED_AT")
        .scrollIntoView()
        .within(() => {
          cy.findByText("TIMESTAMP").should("be.visible");
          cy.findByPlaceholderText("Select a semantic type").should(
            "have.value",
            "Creation timestamp",
          );
        });
    });
  });

  describe.skip("turning table visibility off shouldn't prevent editing related question (metabase#15947)", () => {
    it("simple question (metabase#15947-1)", () => {
      turnTableVisibilityOff(ORDERS_ID);
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.filter();
    });

    it("question with joins (metabase#15947-2)", () => {
      H.createQuestion({
        name: "15947",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              alias: "Products",
            },
          ],
          filter: [
            "and",
            ["=", ["field", ORDERS.QUANTITY, null], 1],
            [">", ["field", PRODUCTS.RATING, { "join-alias": "Products" }], 3],
          ],
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["sum", ["field", PRODUCTS.RATING, { "join-alias": "Products" }]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        turnTableVisibilityOff(PRODUCTS_ID);
        cy.visit(`/question/${QUESTION_ID}/notebook`);
        cy.findByText("Products");
        cy.findByText("Quantity is equal to 1");
        cy.findByText("Rating is greater than 3");
      });
    });
  });
});
