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
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.intercept("POST", "/api/segment").as("createSegment");
      cy.intercept("PUT", "/api/segment/*").as("updateSegment");
      cy.intercept("DELETE", "/api/segment/*").as("deleteSegment");
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    });

    describe("Segment list", () => {
      it("should show empty state and navigation when no segments exist", () => {
        visitDataStudioSegments(ORDERS_ID);

        cy.log("verify empty state");
        SegmentList.getEmptyState().scrollIntoView().should("be.visible");
        SegmentList.get()
          .findByText("Create a segment to filter rows in this table.")
          .should("be.visible");

        cy.log("verify new segment link and navigation");
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.url().should("include", `${getSegmentsBaseUrl(ORDERS_ID)}/new`);
      });

      it("should display segments and allow navigation to edit page", () => {
        createTestSegment({
          name: "High Value Orders",
          filter: [">", ["field", ORDERS.TOTAL, null], 100],
        });
        visitDataStudioSegments(ORDERS_ID);

        cy.log("verify segment in list with filter description");
        SegmentList.getSegment("High Value Orders")
          .scrollIntoView()
          .should("be.visible");
        SegmentList.get()
          .findByTestId("list-item-description")
          .should("contain", "Filtered by Total is greater than 100");

        cy.log("navigate to edit page");
        SegmentList.getSegment("High Value Orders").click();
        cy.get<number>("@segmentId").then((segmentId) => {
          cy.url().should(
            "include",
            `${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}`,
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
      it("should create a segment with filters and verify across features", () => {
        visitDataStudioSegments(ORDERS_ID);

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

        cy.log("verify filter was added");
        SegmentEditor.get()
          .findByText(/Total is greater than 100/i)
          .should("exist");

        cy.log("save segment");
        SegmentEditor.getSaveButton().click();
        cy.wait("@createSegment");

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

      it("should add filter and show preview in menu", () => {
        visitDataStudioSegments(PRODUCTS_ID);

        SegmentList.getNewSegmentLink().scrollIntoView().click();

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
    });

    describe("Segment editing", () => {
      it("should display and update existing segment", () => {
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

        cy.log("verify updated segment in query builder");
        verifySegmentInQueryBuilder("Test Segment Updated");
      });

      it("should navigate back to segments tab via breadcrumb", () => {
        createTestSegment({ name: "Breadcrumb Test Segment" });
        cy.get<number>("@segmentId").then((segmentId) => {
          visitDataModelSegment(ORDERS_ID, segmentId);
        });

        SegmentEditor.getBreadcrumb("Orders").click();

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
          visitDataModelSegment(ORDERS_ID, segmentId);
        });

        cy.log("delete via more menu");
        SegmentEditor.getActionsButton().click();
        H.popover().findByText("Remove segment").click();
        H.modal().button("Remove").click();

        cy.log("verify redirect to list and removal");
        H.undoToast().should("contain.text", "Segment removed");
        cy.url().should(
          "include",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
        SegmentList.get()
          .findByText("Segment to Delete", { timeout: 1000 })
          .should("not.exist");

        cy.log("verify segment removed from query builder");
        verifySegmentNotInQueryBuilder("Segment to Delete");
      });
    });

    describe("Unsaved changes", () => {
      it("should show leave confirmation with unsaved changes", () => {
        visitDataStudioSegments(ORDERS_ID);

        SegmentList.getNewSegmentLink().scrollIntoView().click();
        SegmentEditor.getNameInput().type("Unsaved Segment");

        cy.log("attempt to navigate away");
        SegmentEditor.getBreadcrumb("Orders").click();

        cy.log("verify confirmation modal");
        H.modal().within(() => {
          cy.findByText("Discard your changes?").should("be.visible");
          cy.button("Cancel").click();
        });

        cy.log("verify still on editor");
        SegmentEditor.get().findByText("Unsaved Segment").should("be.visible");
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
      it("should display list values when creating segment filter on Category field", () => {
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

      it("should display list values for implicit join field", () => {
        cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
          has_field_values: "list",
        });

        visitDataStudioSegments(ORDERS_ID);
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("fill in segment name");
        SegmentEditor.getNameInput().type("Gadget Orders");

        cy.log("open filter picker for Product → Category via implicit join");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().within(() => {
          cy.findByText("Product").click();
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

      it("should not show segments from FK tables in the filter picker", () => {
        cy.log("create segment on Products table");
        H.createSegment({
          name: "Expensive Products",
          table_id: PRODUCTS_ID,
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": PRODUCTS_ID,
              filter: [">", ["field", PRODUCTS.PRICE, null], 50],
            },
          },
        });

        cy.log("navigate to create segment on Orders table");
        visitDataStudioSegments(ORDERS_ID);
        SegmentList.getNewSegmentLink().scrollIntoView().click();

        cy.log("open filter picker and expand Product table");
        SegmentEditor.getFilterPlaceholder().click();
        H.popover().findByText("Product").click();

        cy.log("verify Category field is visible but Products segment is not");
        H.popover().findByText("Category").should("be.visible");
        H.popover().findByText("Expensive Products").should("not.exist");
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
            table_id: ORDERS_ID,
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
      });
    });

    describe("Segment cycles", () => {
      it.skip("should prevent creating segment cycles", () => {
        cy.log("create Segment A");
        H.createSegment({
          name: "Segment A",
          table_id: ORDERS_ID,
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: [">", ["field", ORDERS.TOTAL, null], 50],
            },
          },
        }).then(({ body: segmentA }) => {
          cy.log("create Segment B that depends on A");
          H.createSegment({
            name: "Segment B",
            table_id: ORDERS_ID,
            definition: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                filter: ["segment", segmentA.id],
              },
            },
          });

          cy.log("edit Segment A via UI and try to add Segment B as filter");
          visitDataModelSegment(ORDERS_ID, segmentA.id);
          cy.wait("@metadata");

          SegmentEditor.get().icon("add").click();
          H.popover().findByText("Segment B").click();

          cy.log("try to save and verify error");
          SegmentEditor.getSaveButton().click();
          cy.wait("@updateSegment");
          H.undoToast().should(
            "contain.text",
            "Unable to save segments with circular dependencies",
          );
        });
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
          cy.findByText("Total is greater than 100")
            .scrollIntoView()
            .should("be.visible");
          cy.findByText(/updated the description/i)
            .scrollIntoView()
            .should("be.visible");
        });
      });
    });

    describe("Dependencies", () => {
      it("should display dependency graph for a segment", () => {
        createTestSegment({ name: "Dependencies Test Segment" });
        cy.get<number>("@segmentId").then((segmentId) => {
          visitDataModelSegment(ORDERS_ID, segmentId);
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
          .findByText("Dependencies Test Segment")
          .should("be.visible");
      });
    });

    describe("Readonly access for data analysts", () => {
      it("should show segments in list but hide New segment button for non-admin", () => {
        createTestSegment({ name: "Readonly Test Segment" });

        H.setUserAsAnalyst(NODATA_USER_ID);
        cy.signIn("nodata");

        cy.log("verify segment is visible in list");
        visitDataStudioSegments(ORDERS_ID);
        SegmentList.getSegment("Readonly Test Segment")
          .scrollIntoView()
          .should("be.visible");

        cy.log("verify New segment button is not visible");
        SegmentList.get()
          .findByRole("link", { name: /New segment/i })
          .should("not.exist");

        cy.log("verify direct navigation to new segment page is blocked");
        cy.visit(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments/new`,
        );
        cy.url().should("include", "/unauthorized");
      });

      it("should display segment detail in readonly mode for non-admin", () => {
        createTestSegment({
          name: "Readonly Detail Segment",
          description: "Test description for readonly",
        });

        cy.get<number>("@segmentId").then((segmentId) => {
          H.setUserAsAnalyst(NODATA_USER_ID);
          cy.signIn("nodata");

          visitDataModelSegment(ORDERS_ID, segmentId);

          cy.log("verify segment name input is disabled");
          SegmentEditor.get()
            .findByDisplayValue("Readonly Detail Segment")
            .should("be.disabled");

          cy.log("verify description is displayed as plain text");
          SegmentEditor.get().findByText("Description").should("be.visible");
          SegmentEditor.get()
            .findByText("Test description for readonly")
            .should("be.visible");

          cy.log("verify Save button is not visible");
          SegmentEditor.get()
            .findByRole("button", { name: /Save/i })
            .should("not.exist");

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
        });
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
  H.popover().findByText(segmentName).click();

  H.visualize();
  H.tableInteractive().should("be.visible");
}

function verifySegmentNotInQueryBuilder(
  segmentName: string,
  tableId: number = ORDERS_ID,
) {
  H.openTable({ table: tableId, mode: "notebook" });

  H.getNotebookStep("data").button("Filter").click();
  H.popover().findByText(segmentName).should("not.exist");
}
