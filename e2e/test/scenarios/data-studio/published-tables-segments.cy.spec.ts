import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { SegmentList, SegmentEditor } = H.DataModel;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// Majority of the segments pages functionality is covered in the data-model/segments-data-studio.cy.spec.ts spec
// This spec is focused on the published tables segments pages functionality while doing some smoke tests
describe("scenarios > data studio > library > published tables > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.createLibrary();
    H.publishTables({ table_ids: [ORDERS_ID] });

    cy.intercept("POST", "/api/segment").as("createSegment");
    cy.intercept("PUT", "/api/segment/*").as("updateSegment");
  });

  describe("Segment list", () => {
    it("should navigate between Overview, Fields, and Segments tabs", () => {
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);

      H.DataStudio.Tables.overviewTab().should("be.visible");
      H.DataStudio.Tables.fieldsTab().should("be.visible");
      H.DataStudio.Tables.segmentsTab().should("be.visible");

      H.DataStudio.Tables.segmentsTab().click();
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/segments`,
      );

      H.DataStudio.Tables.overviewTab().click();
      cy.url().should("include", `/data-studio/library/tables/${ORDERS_ID}`);
      cy.url().should("not.include", "/segments");
    });
  });

  describe("Segment creation", () => {
    it("should show empty state, create a segment and redirect to edit page", () => {
      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
      SegmentList.getNewSegmentLink().scrollIntoView().click();
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/segments/new`,
      );

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
    });
  });

  describe("Breadcrumbs", () => {
    it("should display collection-based breadcrumbs and navigate back to published table segments", () => {
      createTestSegment("Breadcrumb Nav Test");
      cy.get<number>("@segmentId").then((segmentId) => {
        H.DataStudio.Tables.visitSegmentPage(ORDERS_ID, segmentId);
      });

      SegmentEditor.get().findByText("Data").should("be.visible");
      SegmentEditor.getBreadcrumb("Orders").click();

      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/segments`,
      );
      cy.url().should("not.match", /segments\/\d+/);
    });
  });

  describe("Segment deletion", () => {
    it("should open a segment from the list and redirect to the list after deletion", () => {
      createTestSegment("Segment to Delete");
      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);

      SegmentList.getSegment("Segment to Delete").click();
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.url().should(
          "include",
          `/data-studio/library/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
        SegmentEditor.get()
          .findByDisplayValue("Segment to Delete")
          .should("be.visible");

        cy.log("delete after a direct visit");
        H.DataStudio.Tables.visitSegmentPage(ORDERS_ID, segmentId);
      });

      SegmentEditor.getActionsButton().click();
      H.popover().findByText("Remove segment").click();
      H.modal().button("Remove").click();
      cy.wait("@updateSegment");

      H.undoToast().should("contain.text", "Segment removed");
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/segments`,
      );
      cy.url().should("not.match", /segments\/\d+/);
    });
  });
});

function createTestSegment(name: string) {
  H.createSegment({
    name,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("segmentId");
  });
}
