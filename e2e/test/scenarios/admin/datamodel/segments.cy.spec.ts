import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should create, list and update a segment", () => {
    cy.intercept("POST", "/api/segment").as("createSegment");
    cy.intercept("PUT", "/api/segment/*").as("updateSegment");
    cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
      "getTable",
    );

    cy.visit("/admin");
    cy.findByTestId("admin-navbar-items").contains("Table Metadata").click();
    cy.findByRole("link", { name: /Segments/ }).click();

    cy.log("create a segment");
    cy.button("New segment").click();

    cy.findByTestId("segment-editor").findByText("Select a table").click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });
    cy.wait("@getTable");
    cy.findByTestId("segment-editor").findByText("Orders").should("exist");

    // The "Add filters" button stays disabled until the segment query is built
    // from the fully-loaded table + foreign-key metadata (after `getTable`).
    // Gate the click on it being enabled so we don't click the dead button.
    cy.findByTestId("segment-editor")
      .findByRole("button", { name: /Add filters to narrow your answer/ })
      .should("be.enabled")
      .click();

    H.popover().findByText("Total").click();
    H.selectFilterOperator("Greater than");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("100");
      cy.button("Add filter").click();
    });

    cy.findByLabelText(/Name your segment/i).type("High Value Orders");
    cy.findByLabelText(/Describe your segment/i).type(
      "Orders with high values",
    );
    cy.button(/Save/).click();
    cy.wait("@createSegment").its("response.statusCode").should("eq", 200);

    cy.log("the new segment is listed with its definition");
    cy.url().should("match", /datamodel\/segments$/);
    cy.reload();
    cy.findByRole("table").within(() => {
      cy.findByText("High Value Orders").should("be.visible");
      cy.findByText("Filtered by Total is greater than 100").should(
        "be.visible",
      );
    });

    cy.log("update the segment");
    cy.findByTestId("segment-list-app")
      .contains("High Value Orders")
      .parent()
      .parent()
      .parent()
      .find(".Icon-ellipsis")
      .click();
    H.popover().contains("Edit Segment").click();

    // update the filter from "> 100" to "> 10"
    cy.url().should("match", /segment\/\d+$/);
    cy.get("label").contains("Edit Your Segment");
    cy.findByTestId("filter-pill")
      .contains(/Total\s+is greater than/)
      .click();
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
    cy.wait("@updateSegment").its("response.statusCode").should("eq", 200);

    // get redirected to previous page and see the updated segment after a reload
    cy.url().should("match", /datamodel\/segments$/);
    cy.reload();
    cy.findByRole("table").within(() => {
      cy.findByText("Orders > 10").should("be.visible");
      cy.findByText("Filtered by Total is greater than 10").should(
        "be.visible",
      );
    });

    cy.log("retire the segment");
    cy.findByTestId("segment-list-app")
      .contains("Orders > 10")
      .parent()
      .parent()
      .parent()
      .find(".Icon-ellipsis")
      .click();
    H.popover().findByText("Retire Segment").click();
    H.modal().contains("button", "Retire").click();
  });

  describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";

    beforeEach(() => {
      H.createSegment({
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });
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
  });

  describe("x-ray", () => {
    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should track x-raying a segment", () => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as(
        "getXrayDashboard",
      );

      H.resetSnowplow();
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();

      H.createSegment({
        name: "Foo",
        description: "All orders with a total under $100.",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      }).then(({ body: { id } }) => {
        cy.visit(`/reference/segments/${id}`);
        H.closeNavigationSidebar();
        cy.findAllByRole("listitem")
          .filter(":contains(X-ray this segment)")
          .click();
        cy.wait("@getXrayDashboard");
      });

      cy.findByRole("complementary").within(() => {
        cy.findByRole("heading", { name: "More X-rays" }).should("be.visible");
        cy.findByRole("heading", { name: "Compare" })
          .parent()
          .findByText("Compare with entire dataset")
          .click();
        cy.wait("@getXrayDashboard");
      });

      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "compare",
        triggered_from: "suggestion_sidebar",
      });
    });
  });
});
