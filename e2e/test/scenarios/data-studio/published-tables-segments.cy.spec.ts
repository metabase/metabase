import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { SegmentList, SegmentEditor } = H.DataModel;
const { ORDERS_ID } = SAMPLE_DATABASE;

const TABLE_URL = `/data-studio/library/tables/${ORDERS_ID}`;
const SEGMENTS_URL = `${TABLE_URL}/segments`;

// Majority of the segments pages functionality is covered in the data-model/segments-data-studio.cy.spec.ts spec
// This spec is focused on the published tables segments pages routing while doing some smoke tests
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

  it("should create, open, and remove a segment within the published table routes", () => {
    H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);

    cy.log("navigate from the Overview tab to the Segments tab");
    H.DataStudio.Tables.overviewTab().should("be.visible");
    H.DataStudio.Tables.fieldsTab().should("be.visible");
    H.DataStudio.Tables.segmentsTab().click();
    cy.url().should("include", SEGMENTS_URL);
    SegmentList.getEmptyState().scrollIntoView().should("be.visible");

    cy.log("create a segment");
    SegmentList.getNewSegmentLink().scrollIntoView().click();
    cy.url().should("include", `${SEGMENTS_URL}/new`);

    SegmentEditor.getNameInput().type("Premium Orders");
    SegmentEditor.getFilterPlaceholder().click();
    H.popover().findByText("Total").click();
    H.selectFilterOperator("Greater than");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("100");
      cy.button("Add filter").click();
    });
    SegmentEditor.getSaveButton().click();

    cy.wait("@createSegment").then(({ response }) => {
      cy.wrap(response?.body.id).as("segmentId");
    });
    H.undoToast().should("contain.text", "Segment created");
    cy.url().should("match", new RegExp(`${SEGMENTS_URL}/\\d+$`));

    cy.log("collection-based breadcrumbs lead back to the segments list");
    SegmentEditor.get().findByText("Data").should("be.visible");
    SegmentEditor.getBreadcrumb("Orders").click();
    cy.url().should("include", SEGMENTS_URL);
    cy.url().should("not.match", /segments\/\d+/);

    cy.log("open the segment from the list");
    SegmentList.getSegment("Premium Orders").scrollIntoView().click();
    cy.get<number>("@segmentId").then((segmentId) => {
      cy.url().should("include", `${SEGMENTS_URL}/${segmentId}`);
    });

    cy.log("the segment page loads from a direct link");
    cy.reload();
    SegmentEditor.getActionsButton().should("be.visible");

    cy.log("remove the segment and land back on the segments list");
    SegmentEditor.getActionsButton().click();
    H.popover().findByText("Remove segment").click();
    H.modal().button("Remove").click();
    cy.wait("@updateSegment");

    H.undoToast().should("contain.text", "Segment removed");
    cy.url().should("include", SEGMENTS_URL);
    cy.url().should("not.match", /segments\/\d+/);
    SegmentList.getEmptyState().scrollIntoView().should("be.visible");

    cy.log("navigate back to the Overview tab");
    H.DataStudio.Tables.overviewTab().click();
    cy.url().should("include", TABLE_URL);
    cy.url().should("not.include", "/segments");
  });
});
