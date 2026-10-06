import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { SegmentList, SegmentEditor, SegmentRevisionHistory } = H.DataModel;
const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

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
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    });

    describe("Segment list", () => {
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
        SegmentList.getEmptyState().scrollIntoView().should("be.visible");

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
      it("should show empty state, guard unsaved changes, and create a segment with filters", () => {
        visitDataStudioSegments(ORDERS_ID);

        cy.log("verify empty state");
        SegmentList.getEmptyState().scrollIntoView().should("be.visible");
        SegmentList.get()
          .findByText("Create a segment to filter rows in this table.")
          .should("be.visible");

        cy.log("navigate to new segment page");
        SegmentList.getNewSegmentLink().scrollIntoView().click();
        cy.url().should("include", `${getSegmentsBaseUrl(ORDERS_ID)}/new`);

        cy.log("verify segment_create_started event was tracked");
        H.expectUnstructuredSnowplowEvent({
          event: "segment_create_started",
          triggered_from: "data_studio_segments",
          target_id: ORDERS_ID,
        });

        cy.log("fill in segment name");
        SegmentEditor.getNameInput().type("Premium Orders");

        cy.log("attempt to navigate away with unsaved changes");
        SegmentEditor.getBreadcrumb("Orders").click();
        H.modal().within(() => {
          cy.findByText("Discard your changes?").should("be.visible");
          cy.button("Cancel").click();
        });
        SegmentEditor.get().findByText("Premium Orders").should("be.visible");

        cy.log("add filter");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().findByText("Total").click();
        H.selectFilterOperator("Greater than");
        H.popover().within(() => {
          cy.findByLabelText("Filter value").type("100");
          cy.button("Add filter").click();
        });

        cy.log("verify filter was added");
        SegmentEditor.get()
          .findByText(/Total is greater than 100/i)
          .should("exist");

        cy.log("save segment");
        SegmentEditor.getSaveButton().click();
        cy.wait("@createSegment");

        cy.log("verify segment_created event was tracked");
        H.expectUnstructuredSnowplowEvent({
          event: "segment_created",
          triggered_from: "data_studio_segments",
          result: "success",
        });

        cy.log("verify redirect to edit page and toast");
        H.undoToast().should("contain.text", "Segment created");
        cy.url().should(
          "match",
          new RegExp(
            `${getSegmentsBaseUrl(ORDERS_ID).replace(/\//g, "\\/")}\/\\d+$`,
          ),
        );

        cy.log("verify segment in query builder");
        verifySegmentInQueryBuilder("Premium Orders");
      });
    });

    describe("Segment editing", () => {
      it("should update an existing segment and navigate back via breadcrumb", () => {
        createTestSegment({
          name: "Test Segment",
          description: "Test description",
        });
        cy.get<number>("@segmentId").then((segmentId) => {
          visitDataModelSegment(ORDERS_ID, segmentId);
        });

        cy.log("verify existing data displayed");
        SegmentEditor.get()
          .findByDisplayValue("Test Segment")
          .should("be.visible");
        SegmentEditor.getDescriptionInput().should(
          "have.value",
          "Test description",
        );

        cy.log("update segment name (saves immediately on blur/enter)");
        SegmentEditor.get()
          .findByDisplayValue("Test Segment")
          .click()
          .type(" Updated{enter}");
        cy.wait("@updateSegment");

        cy.log("verify toast for name update");
        H.undoToast().should("contain.text", "Segment name updated");

        cy.log("update description");
        SegmentEditor.getDescriptionInput().clear().type("Updated description");
        SegmentEditor.getSaveButton().click();
        cy.wait("@updateSegment");
        SegmentEditor.getSaveButton().should("not.exist");

        cy.log("navigate back to segments tab via breadcrumb");
        SegmentEditor.getBreadcrumb("Orders").click();
        cy.url().should(
          "include",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
        cy.findByRole("tab", { name: /Segments/i })
          .scrollIntoView()
          .should("have.attr", "aria-selected", "true");

        cy.log("verify updated segment in query builder");
        verifySegmentInQueryBuilder("Test Segment Updated");
      });
    });

    describe("Segment deletion", () => {
      it("should open a segment from the list and remove it via more menu", () => {
        createTestSegment({
          name: "Segment to Delete",
          filter: [">", ["field", ORDERS.TOTAL, null], 100],
        });
        visitDataStudioSegments(ORDERS_ID);

        cy.log("verify segment in list with filter description");
        SegmentList.getSegment("Segment to Delete")
          .scrollIntoView()
          .should("be.visible");
        SegmentList.get()
          .findByTestId("list-item-description")
          .should("contain", "Filtered by Total is greater than 100");

        cy.log("navigate to edit page");
        SegmentList.getSegment("Segment to Delete").click();
        cy.get<number>("@segmentId").then((segmentId) => {
          cy.url().should(
            "include",
            `${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}`,
          );
          SegmentEditor.get()
            .findByDisplayValue("Segment to Delete")
            .should("be.visible");

          cy.log("delete via more menu after a direct visit");
          visitDataModelSegment(ORDERS_ID, segmentId);
        });
        SegmentEditor.getActionsButton().click();
        H.popover().findByText("Remove segment").click();
        H.modal().button("Remove").click();

        cy.log("verify redirect to list and removal");
        H.undoToast().should("contain.text", "Segment removed");
        cy.url().should(
          "include",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
        SegmentList.getEmptyState().scrollIntoView().should("be.visible");
        SegmentList.get()
          .findByText("Segment to Delete", { timeout: 1000 })
          .should("not.exist");

        cy.log("verify segment removed from query builder");
        verifySegmentNotInQueryBuilder("Segment to Delete");
      });
    });

    describe("Segment with implicit joins", () => {
      it("should create a segment with implicit join filter", () => {
        visitDataStudioSegments(ORDERS_ID);

        cy.log("navigate to new segment page");
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("fill in segment name");
        SegmentEditor.getNameInput().type("Widget Orders");

        cy.log("add filter via implicit join");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().within(() => {
          cy.findByText("Product").click();
          cy.findByText("Category").click();
          cy.findByText("Widget").click();
          cy.button("Add filter").click();
        });

        cy.log("verify filter was added and save");
        SegmentEditor.get()
          .findByText(/Product → Category is Widget/i)
          .should("exist");
        SegmentEditor.getSaveButton().click();
        cy.wait("@createSegment");

        cy.log("verify redirected to edit page with segment name");
        SegmentEditor.get().should("be.visible");
        SegmentEditor.get()
          .findByDisplayValue("Widget Orders")
          .should("be.visible");

        cy.log("verify segment works in query builder");
        verifySegmentInQueryBuilder("Widget Orders");
      });
    });

    describe("Segment field values modes", () => {
      it("should display list values on Category field, then add a Price filter with preview", () => {
        cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
          has_field_values: "list",
        });

        visitDataStudioSegments(PRODUCTS_ID);
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("open filter picker for Category");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().findByText("Category").click();

        cy.log("verify list mode UI");
        H.popover().within(() => {
          cy.findByPlaceholderText("Search the list").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Doohickey").should("be.visible");
        });
        cy.realPress("Escape");
        H.popover({ skipVisibilityCheck: true }).should("not.exist");

        cy.log("add Price filter");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().findByText("Price").click();
        H.selectFilterOperator("Less than");
        H.popover().within(() => {
          cy.findByLabelText("Filter value").type("50");
          cy.button("Add filter").click();
        });

        cy.log("verify filter was added");
        SegmentEditor.get()
          .findByText(/Price is less than 50/i)
          .should("exist");

        cy.log("verify preview is available in menu");
        SegmentEditor.getActionsButton().click();
        H.popover().findByText("Preview").should("be.visible");
      });

      it("should display search input when creating segment filter on Email field", () => {
        cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
          has_field_values: "search",
        });

        visitDataStudioSegments(PEOPLE_ID);
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("open filter picker for Email");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().findByText("Email").click();

        cy.log("verify search mode UI and search for email");
        H.popover().within(() => {
          cy.findByRole("combobox").should("be.visible");
          cy.findByRole("combobox").type("borer-hudson@yahoo.com");
        });
        cy.findByRole("listbox")
          .findByText("borer-hudson@yahoo.com")
          .should("be.visible");
      });

      it("should display list values for implicit join field and hide FK table segments", () => {
        cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
          has_field_values: "list",
        });

        cy.log("create segment on Products table");
        H.createSegment({
          name: "Expensive Products",
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": PRODUCTS_ID,
              filter: [">", ["field", PRODUCTS.PRICE, null], 50],
            },
          },
        });

        visitDataStudioSegments(ORDERS_ID);
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("fill in segment name");
        SegmentEditor.getNameInput().type("Gadget Orders");

        cy.log("open filter picker for Product → Category via implicit join");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().within(() => {
          cy.findByText("Product").click();

          cy.log(
            "verify Category field is visible but Products segment is not",
          );
          cy.findByText("Category").should("be.visible");
          cy.findByText("Expensive Products").should("not.exist");

          cy.findByText("Category").click();
        });

        cy.log("verify list values are hydrated for FK table field");
        H.popover().within(() => {
          cy.findByPlaceholderText("Search the list").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gadget").click();
          cy.button("Add filter").click();
        });

        cy.log("verify filter was added and save segment");
        SegmentEditor.get()
          .findByText(/Product → Category is Gadget/i)
          .should("exist");
        SegmentEditor.getSaveButton().click();
        cy.wait("@createSegment");

        cy.log("verify segment created");
        H.undoToast().should("contain.text", "Segment created");
        SegmentEditor.get()
          .findByDisplayValue("Gadget Orders")
          .should("be.visible");
      });
    });

    describe("Segment dependencies", () => {
      it("should create and use a segment based on another segment", () => {
        cy.log("create base segment");
        createTestSegment({
          name: "High Value Orders",
          filter: [">", ["field", ORDERS.TOTAL, null], 100],
        });

        cy.get<number>("@segmentId").then((baseSegmentId) => {
          cy.log("create segment based on segment");
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

        cy.log("verify both segments appear in query builder");
        verifySegmentInQueryBuilder("High Value Orders");
        H.openTable({ table: ORDERS_ID, mode: "notebook" });
        H.getNotebookStep("data").button("Filter").click();
        H.popover().findByText("High Value Recent Orders").should("be.visible");

        cy.log("verify dependent segment works");
        H.popover().findByText("High Value Recent Orders").click();
        H.visualize();
        H.tableInteractive().should("be.visible");
        H.queryBuilderFiltersPanel()
          .findByText("High Value Recent Orders")
          .should("be.visible");
      });
    });

    describe("Revision history", () => {
      it("should display revision history with changes to name, description, and filter, and the dependency graph", () => {
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
            revision_message: "Updated from Data Studio",
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
            revision_message: "Updated from Data Studio",
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
            revision_message: "Updated from Data Studio",
            definition: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                filter: [">", ["field", ORDERS.TOTAL, null], 100],
              },
            },
          });

          cy.wait(1000);

          visitDataModelSegment(ORDERS_ID, segmentId);
        });

        cy.log("navigate to revision history tab");
        SegmentEditor.getRevisionHistoryTab().click();

        cy.log("verify URL");
        cy.get<number>("@segmentId").then((segmentId) => {
          cy.url().should(
            "include",
            `${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}/revisions`,
          );
        });

        cy.log("verify revision history entries");
        SegmentRevisionHistory.get().within(() => {
          cy.findByText(/created this segment/i)
            .scrollIntoView()
            .should("be.visible");
          cy.findByText(/renamed the segment/i)
            .scrollIntoView()
            .should("be.visible");
          cy.findByText(/changed the filter definition/i)
            .scrollIntoView()
            .should("be.visible");
          cy.findByText("Total is greater than 100")
            .scrollIntoView()
            .should("be.visible");
          cy.findByText(/updated the description/i)
            .scrollIntoView()
            .should("be.visible");
        });

        cy.log("navigate to dependencies tab");
        SegmentEditor.getDependenciesTab().click();

        cy.log("verify URL and dependency graph display");
        cy.get<number>("@segmentId").then((segmentId) => {
          cy.url().should(
            "include",
            `${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}/dependencies`,
          );
        });
        H.DependencyGraph.graph().should("be.visible");
        H.DependencyGraph.graph()
          .findByText("Updated Name")
          .should("be.visible");
      });
    });

    describe("Readonly access for data analysts", () => {
      it("should show segments read-only and block segment creation for non-admin", () => {
        createTestSegment({
          name: "Readonly Detail Segment",
          description: "Test description for readonly",
        });

        H.setUserAsAnalyst(NODATA_USER_ID);
        cy.signIn("nodata");

        cy.log("verify segment is visible in list");
        visitDataStudioSegments(ORDERS_ID);
        SegmentList.getSegment("Readonly Detail Segment")
          .scrollIntoView()
          .should("be.visible");

        cy.log("verify New segment button is not visible");
        SegmentList.get()
          .findByRole("link", { name: /New segment/i })
          .should("not.exist");

        cy.get<number>("@segmentId").then((segmentId) => {
          visitDataModelSegment(ORDERS_ID, segmentId);
        });

        cy.log("verify segment name input is disabled");
        SegmentEditor.get()
          .findByDisplayValue("Readonly Detail Segment")
          .should("be.disabled");

        cy.log("verify description is displayed as plain text");
        SegmentEditor.get().findByText("Description").should("be.visible");
        SegmentEditor.get()
          .findByText("Test description for readonly")
          .should("be.visible");

        cy.log("verify filter is shown but cannot be changed");
        SegmentEditor.get()
          .findByText(/Total is less than 100/i)
          .should("be.visible");
        SegmentEditor.get().icon("add").should("not.exist");

        cy.log("verify Remove segment option is hidden in actions menu");
        SegmentEditor.getActionsButton().click();
        H.popover().findByText("Preview").should("be.visible");
        H.popover().findByText("Remove segment").should("not.exist");
        cy.realPress("Escape");

        cy.log("verify revision history is still accessible");
        SegmentEditor.getRevisionHistoryTab().click();
        SegmentRevisionHistory.get().within(() => {
          cy.findByText(/created this segment/i)
            .scrollIntoView()
            .should("be.visible");
        });

        cy.log("verify direct navigation to new segment page is blocked");
        cy.visit(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments/new`,
        );
        cy.url().should("include", "/unauthorized");
      });
    });
  },
);

function visitDataStudioTable(tableId: number) {
  H.DataModel.visitDataStudio({
    databaseId: SAMPLE_DB_ID,
    schemaId: SAMPLE_DB_SCHEMA_ID,
    tableId,
  });
}

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

function visitDataModelSegment(tableId: number, segmentId: number) {
  cy.visit(`${getSegmentsBaseUrl(tableId)}/${segmentId}`);
}

function createTestSegment(
  opts: {
    name?: string;
    description?: string;
    filter?: unknown[];
  } = {},
) {
  const {
    name = "Test Segment",
    description,
    filter = ["<", ["field", ORDERS.TOTAL, null], 100],
  } = opts;

  H.createSegment({
    name,
    description,
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
