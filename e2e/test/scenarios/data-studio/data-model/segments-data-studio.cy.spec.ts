import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { SegmentList, SegmentEditor, SegmentRevisionHistory } = H.DataModel;
const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

// The UI states of the segment list and editor (tabs, unsaved changes guard,
// filter value modes, breadcrumbs, read-only view, published table pages) are
// covered by Jest tests in frontend/src/metabase/data-studio/segments and
// enterprise/frontend/src/metabase-enterprise/data-studio/library/tables.
// These tests check what needs the real backend: the writes, the stored
// revisions, the dependency graph, and the segments in the query builder.
describe(
  "scenarios > data studio > data model > segments",
  { tags: "@EE" },
  () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      cy.intercept("POST", "/api/segment").as("createSegment");
      cy.intercept("PUT", "/api/segment/*").as("updateSegment");
    });

    it("should create, rename, and remove a segment, and use it in the query builder", () => {
      cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
        has_field_values: "list",
      });

      visitDataStudioSegments(ORDERS_ID);
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
      SegmentList.getNewSegmentLink().scrollIntoView().click();

      H.expectUnstructuredSnowplowEvent({
        event: "segment_create_started",
        triggered_from: "data_studio_segments",
        target_id: ORDERS_ID,
      });

      cy.log("create a segment with a filter on an implicitly joined field");
      SegmentEditor.getNameInput().type("Gadget Orders");
      SegmentEditor.getFilterPlaceholder().click();
      H.popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      SegmentEditor.get()
        .findByText(/Product → Category is Gadget/i)
        .should("exist");
      SegmentEditor.getSaveButton().click();
      cy.wait("@createSegment");

      H.expectUnstructuredSnowplowEvent({
        event: "segment_created",
        triggered_from: "data_studio_segments",
        result: "success",
      });
      H.undoToast().should("contain.text", "Segment created");
      cy.url().should(
        "match",
        new RegExp(
          `${getSegmentsBaseUrl(ORDERS_ID).replace(/\//g, "\\/")}\/\\d+$`,
        ),
      );

      cy.log("rename the segment");
      SegmentEditor.get()
        .findByDisplayValue("Gadget Orders")
        .click()
        .type(" Updated{enter}");
      cy.wait("@updateSegment");
      H.undoToast().should("contain.text", "Segment name updated");

      cy.log("the stored segment has the new name and the filter");
      cy.reload();
      SegmentEditor.get()
        .findByDisplayValue("Gadget Orders Updated")
        .should("be.visible");
      SegmentEditor.get()
        .findByText(/Product → Category is Gadget/i)
        .should("be.visible");

      cy.log("the revision history shows the stored revisions");
      SegmentEditor.getRevisionHistoryTab().click();
      SegmentRevisionHistory.get().within(() => {
        cy.findByText(/created this segment/i)
          .scrollIntoView()
          .should("be.visible");
        cy.findByText(/renamed the segment/i)
          .scrollIntoView()
          .should("be.visible");
        // The revision pill names the column without the join prefix that
        // the editor shows ("Product → Category is Gadget").
        cy.findByText("Category is Gadget")
          .scrollIntoView()
          .should("be.visible");
      });

      cy.log("the dependency graph shows the segment");
      SegmentEditor.getDependenciesTab().click();
      cy.url().should("match", /\/segments\/\d+\/dependencies$/);
      H.DependencyGraph.graph()
        .findByText("Gadget Orders Updated")
        .should("be.visible");

      verifySegmentInQueryBuilder("Gadget Orders Updated");

      cy.log("the segment list shows the filter description");
      visitDataStudioSegments(ORDERS_ID);
      SegmentList.getSegment("Gadget Orders Updated")
        .scrollIntoView()
        .should("be.visible");
      SegmentList.get()
        .findByTestId("list-item-description")
        .should("contain", "Category is Gadget");

      cy.log("remove the segment");
      SegmentList.getSegment("Gadget Orders Updated").click();
      SegmentEditor.getActionsButton().click();
      H.popover().findByText("Remove segment").click();
      H.modal().button("Remove").click();
      cy.wait("@updateSegment");

      H.undoToast().should("contain.text", "Segment removed");
      cy.url().should("match", /\/segments$/);
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
      SegmentList.get().findByText("Gadget Orders Updated").should("not.exist");

      verifySegmentNotInQueryBuilder("Gadget Orders Updated");
    });

    it("should use a segment based on another segment in the query builder", () => {
      createTestSegment({
        name: "High Value Orders",
        filter: [">", ["field", ORDERS.TOTAL, null], 100],
      });

      cy.get<number>("@segmentId").then((baseSegmentId) => {
        H.createSegment({
          name: "High Value Recent Orders",
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: [
                "and",
                ["segment", baseSegmentId],
                [">", ["field", ORDERS.CREATED_AT, null], "2020-01-01"],
              ],
            },
          },
        });
      });

      verifySegmentInQueryBuilder("High Value Orders");
      verifySegmentInQueryBuilder("High Value Recent Orders");
    });

    it("should create and remove a segment on a published table", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
      SegmentList.getNewSegmentLink().scrollIntoView().click();

      SegmentEditor.getNameInput().type("Premium Orders");
      SegmentEditor.getFilterPlaceholder().click();
      H.popover().findByText("Total").click();
      H.selectFilterOperator("Greater than");
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("100");
        cy.button("Add filter").click();
      });
      SegmentEditor.getSaveButton().click();
      cy.wait("@createSegment");

      H.undoToast().should("contain.text", "Segment created");
      cy.url().should(
        "match",
        new RegExp(`/data-studio/library/tables/${ORDERS_ID}/segments/\\d+$`),
      );

      cy.log("the stored segment is in its published table's collection");
      cy.reload();
      SegmentEditor.get()
        .findByDisplayValue("Premium Orders")
        .should("be.visible");
      SegmentEditor.get().findByText("Data").should("be.visible");
      SegmentEditor.get()
        .findByText(/Total is greater than 100/i)
        .should("be.visible");

      SegmentEditor.getActionsButton().click();
      H.popover().findByText("Remove segment").click();
      H.modal().button("Remove").click();
      cy.wait("@updateSegment");

      H.undoToast().should("contain.text", "Segment removed");
      cy.url().should(
        "match",
        new RegExp(`/data-studio/library/tables/${ORDERS_ID}/segments$`),
      );
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
    });

    it("should show segments read-only to a data analyst", () => {
      createTestSegment({ name: "Readonly Detail Segment" });

      H.setUserAsAnalyst(NODATA_USER_ID);
      cy.signIn("nodata");

      visitDataStudioSegments(ORDERS_ID);
      SegmentList.getSegment("Readonly Detail Segment")
        .scrollIntoView()
        .should("be.visible");
      SegmentList.get()
        .findByRole("link", { name: /New segment/i })
        .should("not.exist");

      SegmentList.getSegment("Readonly Detail Segment").click();
      SegmentEditor.get()
        .findByDisplayValue("Readonly Detail Segment")
        .should("be.disabled");
      SegmentEditor.get()
        .findByText(/Total is less than 100/i)
        .should("be.visible");
    });
  },
);

function visitDataStudioSegments(tableId: number) {
  H.DataModel.visitDataStudioSegments({
    databaseId: SAMPLE_DB_ID,
    schemaId: SAMPLE_DB_SCHEMA_ID,
    tableId,
  });
}

function getSegmentsBaseUrl(tableId: number) {
  return `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}/segments`;
}

function createTestSegment(opts: { name: string; filter?: unknown[] }) {
  const { name, filter = ["<", ["field", ORDERS.TOTAL, null], 100] } = opts;

  H.createSegment({
    name,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter,
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("segmentId");
  });
}

function verifySegmentInQueryBuilder(segmentName: string) {
  H.openTable({ table: ORDERS_ID, mode: "notebook" });

  H.getNotebookStep("data").button("Filter").click();
  H.popover().findByText(segmentName).click();

  H.visualize();
  H.tableInteractive().should("be.visible");
  H.queryBuilderFiltersPanel().findByText(segmentName).should("be.visible");
}

function verifySegmentNotInQueryBuilder(segmentName: string) {
  H.openTable({ table: ORDERS_ID, mode: "notebook" });

  H.getNotebookStep("data").button("Filter").click();
  H.popover().findByText("Total").should("be.visible");
  H.popover().findByText(segmentName).should("not.exist");
}
