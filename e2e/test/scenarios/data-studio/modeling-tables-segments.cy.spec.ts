import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { SegmentList, SegmentEditor, SegmentRevisionHistory } = H.DataModel;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > modeling > tables > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.createLibrary();
    H.publishTables({ table_ids: [ORDERS_ID] });

    cy.intercept("POST", "/api/segment").as("createSegment");
    cy.intercept("PUT", "/api/segment/*").as("updateSegment");
    cy.intercept("DELETE", "/api/segment/*").as("deleteSegment");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
  });

  describe("Segment list", () => {
    it("should show empty state when no segments exist", () => {
      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);

      cy.log("verify empty state");
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");
      SegmentList.get()
        .findByText("Create a segment to filter rows in this table.")
        .should("be.visible");

      cy.log("verify new segment link and navigation");
      SegmentList.getNewSegmentLink().scrollIntoView().click();

      cy.url().should(
        "include",
        `/data-studio/modeling/tables/${ORDERS_ID}/segments/new`,
      );
    });

    it("should display segments and navigate to edit page", () => {
      createTestSegment({
        name: "High Value Orders",
        filter: [">", ["field", ORDERS.TOTAL, null], 100],
      });
      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);

      cy.log("verify segment in list");
      SegmentList.getSegment("High Value Orders")
        .scrollIntoView()
        .should("be.visible");

      cy.log("navigate to edit page");
      SegmentList.getSegment("High Value Orders").click();
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.url().should(
          "include",
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });
    });

    it("should navigate between Overview, Fields, and Segments tabs", () => {
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);

      cy.log("verify tabs visible");
      H.DataStudio.Tables.overviewTab().should("be.visible");
      H.DataStudio.Tables.fieldsTab().should("be.visible");
      H.DataStudio.Tables.segmentsTab().should("be.visible");

      cy.log("navigate to segments tab");
      H.DataStudio.Tables.segmentsTab().click();
      cy.url().should(
        "include",
        `/data-studio/modeling/tables/${ORDERS_ID}/segments`,
      );
      SegmentList.getEmptyState().scrollIntoView().should("be.visible");

      cy.log("navigate back to overview tab");
      H.DataStudio.Tables.overviewTab().click();
      cy.url().should("include", `/data-studio/modeling/tables/${ORDERS_ID}`);
      cy.url().should("not.include", "/segments");
    });
  });

  describe("Segment creation", () => {
    it("should create a segment from published table view", () => {
      H.DataStudio.Tables.visitSegmentsPage(ORDERS_ID);

      cy.log("navigate to new segment page");
      SegmentList.getNewSegmentLink().scrollIntoView().click();

      cy.log("fill in segment name");
      SegmentEditor.getNameInput().type("Premium Orders");

      cy.log("add filter");
      SegmentEditor.getFilterPlaceholder().click();
      H.popover().findByText("Total").click();
      H.selectFilterOperator("Greater than");
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("100");
        cy.button("Add filter").click();
      });

      cy.log("verify row count and save");
      SegmentEditor.getRowCount().should("be.visible");
      SegmentEditor.getSaveButton().click();
      cy.wait("@createSegment");

      cy.log("verify redirect to edit page");
      H.undoToast().should("contain.text", "Segment created");
      cy.url().should(
        "match",
        new RegExp(`/data-studio/modeling/tables/${ORDERS_ID}/segments/\\d+$`),
      );
    });
  });

  describe("Breadcrumbs", () => {
    it("should display collection-based breadcrumbs", () => {
      createTestSegment({ name: "Breadcrumb Test Segment" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });

      cy.log("verify collection breadcrumb is visible");
      SegmentEditor.get().findByText("Data").should("be.visible");
    });

    it("should navigate back to published table segments via breadcrumb", () => {
      createTestSegment({ name: "Breadcrumb Nav Test" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });

      cy.log("click table breadcrumb");
      SegmentEditor.getBreadcrumb("Orders").click();

      cy.log("verify navigation to published table segments list");
      cy.url().should(
        "include",
        `/data-studio/modeling/tables/${ORDERS_ID}/segments`,
      );
      cy.url().should("not.match", /segments\/\d+/);
    });
  });

  describe("Segment deletion", () => {
    it("should redirect to published table segments list after deletion", () => {
      createTestSegment({ name: "Segment to Delete" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });

      cy.log("delete via more menu");
      SegmentEditor.getActionsButton().click();
      H.popover().findByText("Remove segment").click();
      H.modal().button("Remove").click();
      cy.wait("@deleteSegment");

      cy.log("verify redirect to published table segments list");
      H.undoToast().should("contain.text", "Segment removed");
      cy.url().should(
        "include",
        `/data-studio/modeling/tables/${ORDERS_ID}/segments`,
      );
      cy.url().should("not.match", /segments\/\d+/);
      SegmentList.get()
        .findByText("Segment to Delete", { timeout: 1000 })
        .should("not.exist");
    });
  });

  describe("Revision history", () => {
    it("should display revision history with changes to name, description, and filter", () => {
      createTestSegment({
        name: "Original Name",
        description: "Original description",
        filter: ["<", ["field", ORDERS.TOTAL, null], 50],
      });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.log("update segment name");
        cy.request("PUT", `/api/segment/${segmentId}`, {
          name: "Updated Name",
          description: "Original description",
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: ["<", ["field", ORDERS.TOTAL, null], 50],
            },
          },
        });

        cy.log("update segment description");
        cy.request("PUT", `/api/segment/${segmentId}`, {
          name: "Updated Name",
          description: "Updated description",
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: ["<", ["field", ORDERS.TOTAL, null], 50],
            },
          },
        });

        cy.log("update segment filter");
        cy.request("PUT", `/api/segment/${segmentId}`, {
          name: "Updated Name",
          description: "Updated description",
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: [">", ["field", ORDERS.TOTAL, null], 100],
            },
          },
        });

        cy.visit(
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });

      cy.log("navigate to revision history tab");
      SegmentEditor.getRevisionHistoryTab().click();

      cy.log("verify URL");
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.url().should(
          "include",
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}/revisions`,
        );
      });

      cy.log("verify revision history entries");
      SegmentRevisionHistory.get().within(() => {
        cy.findByText(/created this segment/i).should("be.visible");
        cy.findByText(/renamed the segment/i).should("be.visible");
        cy.findByText(/updated the description/i).should("be.visible");
        cy.findByText(/changed the filter definition/i).should("be.visible");
      });

      cy.log("verify diff details are shown");
      SegmentRevisionHistory.get().within(() => {
        cy.findAllByText(/name/i).should("have.length.at.least", 1);
        cy.findAllByText(/description/i).should("have.length.at.least", 1);
        cy.findAllByText(/filter/i).should("have.length.at.least", 1);
      });
    });
  });

  describe("Dependencies", () => {
    it("should display dependency graph for a segment", () => {
      createTestSegment({ name: "Dependencies Test Segment" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}`,
        );
      });

      cy.log("navigate to dependencies tab");
      SegmentEditor.getDependenciesTab().click();

      cy.log("verify URL and dependency graph display");
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.url().should(
          "include",
          `/data-studio/modeling/tables/${ORDERS_ID}/segments/${segmentId}/dependencies`,
        );
      });
      H.DependencyGraph.graph().should("be.visible");
      H.DependencyGraph.graph()
        .findByText("Dependencies Test Segment")
        .should("be.visible");
    });
  });
});

function createTestSegment(
  opts: {
    name?: string;
    description?: string;
    tableId?: number;
    filter?: unknown[];
  } = {},
) {
  const {
    name = "Test Segment",
    description,
    tableId = ORDERS_ID,
    filter = ["<", ["field", ORDERS.TOTAL, null], 100],
  } = opts;

  H.createSegment({
    name,
    description,
    table_id: tableId,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        filter,
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("segmentId");
  });
}
