import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > data model > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("POST", "/api/segment").as("createSegment");
    cy.intercept("PUT", "/api/segment/*").as("updateSegment");
    cy.intercept("DELETE", "/api/segment/*").as("deleteSegment");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
  });

  describe("Segment list", () => {
    it("should show empty state and navigation when no segments exist", () => {
      visitDataStudioTableSegmentsTab(ORDERS_ID);

      cy.log("verify empty state");
      H.main()
        .findByText("No segments yet")
        .scrollIntoView()
        .should("be.visible");
      H.main()
        .findByText("Create a segment to filter rows in this table.")
        .should("be.visible");

      cy.log("verify new segment link and navigation");
      H.main()
        .findByRole("link", { name: /New segment/i })
        .scrollIntoView()
        .click();

      cy.url().should(
        "include",
        `/data-studio/library/segments/new?tableId=${ORDERS_ID}`,
      );
    });

    it("should display segments and allow navigation to edit page", () => {
      createTestSegment({
        name: "High Value Orders",
        filter: [">", ["field", ORDERS.TOTAL, null], 100],
      });
      visitDataStudioTableSegmentsTab(ORDERS_ID);

      cy.log("verify segment in list with filter description");
      H.main()
        .findByRole("listitem", { name: "High Value Orders" })
        .scrollIntoView()
        .should("be.visible");
      H.main()
        .findByTestId("list-item-description")
        .should("contain", "Filtered by Total is greater than 100");

      cy.log("navigate to edit page");
      H.main().findByRole("listitem", { name: "High Value Orders" }).click();
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.url().should(
          "include",
          `/data-studio/library/segments/${segmentId}`,
        );
      });
    });

    it("should navigate between Fields and Segments tabs", () => {
      visitDataStudioTable(ORDERS_ID);

      cy.log("verify both tabs visible");
      cy.findByRole("tab", { name: /Fields/i }).scrollIntoView();
      cy.findByRole("tab", { name: /Segments/i }).should("be.visible");

      cy.log("navigate to segments tab");
      cy.findByRole("tab", { name: /Segments/i }).click();
      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
      );
      H.main()
        .findByText("No segments yet")
        .scrollIntoView()
        .should("be.visible");

      cy.log("verify tab selection preserved on refresh");
      cy.reload();
      cy.wait("@metadata");
      cy.findByRole("tab", { name: /Segments/i })
        .scrollIntoView()
        .should("have.attr", "aria-selected", "true");

      cy.log("navigate back to fields tab");
      cy.findByRole("tab", { name: /Fields/i }).click();
      cy.url().should("include", "/field");
    });
  });

  describe("Segment creation", () => {
    it("should create a segment with filters and verify across features", () => {
      visitDataStudioTableSegmentsTab(ORDERS_ID);

      cy.log("navigate to new segment page");
      H.main()
        .findByRole("link", { name: /New segment/i })
        .scrollIntoView()
        .click();

      cy.log("fill in segment name");
      cy.findByPlaceholderText("New segment").type("Premium Orders");

      cy.log("add filter");
      H.main()
        .findByText("Add filters to narrow your answer")
        .scrollIntoView()
        .click();
      H.popover().findByText("Total").click();
      H.selectFilterOperator("Greater than");
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("100");
        cy.button("Add filter").click();
      });

      cy.log("verify row count preview");
      H.main()
        .findByText(/\d+ rows/)
        .scrollIntoView()
        .should("be.visible");

      cy.log("verify preview link");
      H.main()
        .findByRole("link", { name: /Preview/i })
        .should("be.visible");

      cy.log("save segment");
      H.main().button("Save").scrollIntoView().click();
      cy.wait("@createSegment");

      cy.log("verify redirect to edit page and toast");
      H.undoToast().should("contain.text", "Segment created");
      cy.url().should("match", /\/data-studio\/library\/segments\/\d+$/);

      cy.log("verify segment in query builder");
      verifySegmentInQueryBuilder("Premium Orders");
    });

    it("should show row count when filters are added", () => {
      visitDataStudioTableSegmentsTab(PRODUCTS_ID);

      H.main()
        .findByRole("link", { name: /New segment/i })
        .scrollIntoView()
        .click();

      H.main()
        .findByText("Add filters to narrow your answer")
        .scrollIntoView()
        .click();
      H.popover().findByText("Price").click();
      H.selectFilterOperator("Less than");
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("50");
        cy.button("Add filter").click();
      });

      H.main()
        .findByText(/\d+ rows/)
        .scrollIntoView()
        .should("be.visible");
    });
  });

  describe("Segment editing", () => {
    it("should display and update existing segment", () => {
      createTestSegment({
        name: "Test Segment",
        description: "Test description",
      });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(`/data-studio/library/segments/${segmentId}`);
      });

      cy.log("verify existing data displayed");
      H.main().findByText("Test Segment").scrollIntoView().should("be.visible");
      H.main()
        .findByLabelText("Description")
        .scrollIntoView()
        .should("have.value", "Test description");

      cy.log("update segment name");
      H.main().findByText("Test Segment").click().type(" Updated{enter}");
      H.main().button("Save").scrollIntoView().click();
      cy.wait("@updateSegment");

      cy.log("verify toast (stays on edit page)");
      H.undoToast().should("contain.text", "Segment updated");

      cy.log("verify updated segment in query builder");
      verifySegmentInQueryBuilder("Test Segment Updated");
    });

    it("should navigate back to segments tab via breadcrumb", () => {
      createTestSegment({ name: "Breadcrumb Test Segment" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(`/data-studio/library/segments/${segmentId}`);
      });

      H.main().findByText("Orders segments").scrollIntoView().click();

      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
      );
      cy.findByRole("tab", { name: /Segments/i })
        .scrollIntoView()
        .should("have.attr", "aria-selected", "true");
    });
  });

  describe("Segment deletion", () => {
    it("should remove segment via more menu", () => {
      createTestSegment({ name: "Segment to Delete" });
      cy.get<number>("@segmentId").then((segmentId) => {
        cy.visit(`/data-studio/library/segments/${segmentId}`);
      });

      cy.log("delete via more menu");
      cy.findByLabelText("Segment actions").click();
      H.popover().findByText("Remove segment").click();
      H.modal().button("Remove").click();
      cy.wait("@deleteSegment");

      cy.log("verify redirect to list and removal");
      H.undoToast().should("contain.text", "Segment removed");
      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
      );
      H.main()
        .findByText("Segment to Delete", { timeout: 1000 })
        .should("not.exist");

      cy.log("verify segment removed from query builder");
      verifySegmentNotInQueryBuilder("Segment to Delete");
    });
  });

  describe("Unsaved changes", () => {
    it("should show leave confirmation with unsaved changes", () => {
      visitDataStudioTableSegmentsTab(ORDERS_ID);

      H.main()
        .findByRole("link", { name: /New segment/i })
        .scrollIntoView()
        .click();
      cy.findByPlaceholderText("New segment").type("Unsaved Segment");

      cy.log("attempt to navigate away");
      H.main().findByText("Orders segments").scrollIntoView().click();

      cy.log("verify confirmation modal");
      H.modal().within(() => {
        cy.findByText("Discard your changes?").should("be.visible");
        cy.button("Cancel").click();
      });

      cy.log("verify still on editor");
      H.main().findByText("Unsaved Segment").should("be.visible");
    });
  });
});

function visitDataStudioTable(tableId: number) {
  H.DataModel.visitDataStudio({
    databaseId: SAMPLE_DB_ID,
    schemaId: SAMPLE_DB_SCHEMA_ID,
    tableId,
  });
}

function visitDataStudioTableSegmentsTab(tableId: number) {
  cy.visit(
    `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}/segments`,
  );
  cy.wait("@metadata");
}

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

function verifySegmentInQueryBuilder(
  segmentName: string,
  tableId: number = ORDERS_ID,
) {
  H.openTable({ table: tableId, mode: "notebook" });

  H.getNotebookStep("data").button("Filter").click();
  H.popover().findByText(segmentName).should("be.visible");
}

function verifySegmentNotInQueryBuilder(
  segmentName: string,
  tableId: number = ORDERS_ID,
) {
  H.openTable({ table: tableId, mode: "notebook" });

  H.getNotebookStep("data").button("Filter").click();
  H.popover().findByText(segmentName).should("not.exist");
}
