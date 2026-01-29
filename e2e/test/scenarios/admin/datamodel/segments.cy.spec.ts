import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

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
      H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });

      cy.findByTestId("segment-editor").findByText("Orders").should("exist");

      cy.findByTestId("segment-editor")
        .findByText("Add filters to narrow your answer")
        .click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      H.popover().findByText("Custom Expression");
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");

      cy.get("main")
        .findByText("Segments are interesting subsets of tables")
        .should("be.visible");
      cy.button("Learn how to create segments").should("be.visible");
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
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      }).then(({ body }) => {
        cy.wrap(body.id).as("segmentId");
      });
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");

      cy.findByTestId("data-reference-list-item")
        .findByText(SEGMENT_NAME)
        .should("be.visible")
        .click();

      // Detail view
      cy.get("main").findByText("Description").should("be.visible");
      cy.button("See this segment").should("be.visible");

      // Segment fields
      cy.findByRole("link", { name: /Fields in this segment/ }).click();
      cy.button("See this segment").should("not.exist");
      cy.get("main")
        .findByText(`Fields in ${SEGMENT_NAME}`)
        .should("be.visible");
      cy.get("main")
        .findAllByText("Discount")
        .should("have.length", 2)
        .eq(0)
        .scrollIntoView()
        .should("be.visible");
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
      cy.findByRole("link", { name: /Segments/ }).click();

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
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.get("@revisions")
          .last()
          .should("contain", `You created "${SEGMENT_NAME}"`)
          .and("contain", "All orders with a total under $100.");
      }
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
        table_id: ORDERS_ID,
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
        cy.findAllByRole("listitem")
          .filter(":contains(X-ray this segment)")
          .click();
        cy.wait("@getXrayDashboard");
      });

      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "segment",
        triggered_from: "data_reference",
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

  describe("read-only remote sync", () => {
    const SEGMENT_IN_ORDERS = "Segment in Orders table (published)";
    const SEGMENT_IN_PEOPLE = "Segment in People table (Unpublished)";

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      cy.log("set up remote sync");
      H.setupGitSync();
      H.configureGit("read-only");
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      // Let's leave PEOPLE_ID unpublished

      cy.log("create segments");
      H.createSegment({
        name: SEGMENT_IN_ORDERS,
        description: "Hey oh",
        table_id: ORDERS_ID,
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });

      H.createSegment({
        name: SEGMENT_IN_PEOPLE,
        description: "This is a segment in the PEOPLE table",
        table_id: PEOPLE_ID,
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": PEOPLE_ID,
            filter: [">", ["field", 10, null], 100],
          },
        },
      });
    });

    it("can't edit published segment from segment list", () => {
      cy.visit("/admin/datamodel/segments");
      const getEllipsisIcon = (segmentName: string) => {
        return cy
          .findByTestId("segment-list-app")
          .contains(segmentName)
          .parent()
          .parent()
          .findByRole("img", { name: "ellipsis icon" });
      };

      cy.log("don't show edit or retire menu options");
      getEllipsisIcon(SEGMENT_IN_ORDERS).click();
      H.popover().contains("Edit Segment").should("not.exist");
      H.popover().contains("Retire Segment").should("not.exist");
      getEllipsisIcon(SEGMENT_IN_ORDERS).click(); // Exit menu dropdown

      getEllipsisIcon(SEGMENT_IN_PEOPLE).click();
      // For unpublished segments, the edit menu options are visible
      H.popover().contains("Edit Segment").should("be.visible");
      H.popover().contains("Retire Segment").should("be.visible");
    });

    it("can't edit published segment from segment detail page", () => {
      cy.visit("/admin/datamodel/segment/1");

      cy.findByRole("alert", {
        name: /This segment can't be edited/,
      }).should("be.visible");
      cy.findByLabelText("Name Your Segment").should("have.attr", "readonly");
      cy.findByLabelText("Describe Your Segment").should(
        "have.attr",
        "readonly",
      );
      cy.findByRole("button", { name: /Save changes/ }).should("not.exist");

      cy.log("can still edit a segment if table is not published");
      cy.visit("/admin/datamodel/segment/2");

      cy.findByRole("alert", {
        name: /This segment can't be edited/,
      }).should("not.exist");
      cy.findByLabelText("Name Your Segment").should(
        "not.have.attr",
        "readonly",
      );
      cy.findByLabelText("Describe Your Segment").should(
        "not.have.attr",
        "readonly",
      );
      cy.findByRole("button", { name: /Save changes/ }).should("be.visible");
    });
  });
});
