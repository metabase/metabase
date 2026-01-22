import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { MeasureList, MeasureEditor, MeasureRevisionHistory } = H.DataModel;
const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > data model > measures", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("POST", "/api/measure").as("createMeasure");
    cy.intercept("PUT", "/api/measure/*").as("updateMeasure");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
  });

  describe("Measure list", () => {
    it("should show empty state and navigation when no measures exist", () => {
      visitDataStudioMeasures(ORDERS_ID);

      cy.log("verify empty state");
      MeasureList.getEmptyState().scrollIntoView().should("be.visible");
      MeasureList.get()
        .findByText(
          "Create a measure to define a reusable aggregation for this table.",
        )
        .should("be.visible");

      cy.log("verify new measure link and navigation");
      MeasureList.getNewMeasureLink().scrollIntoView().click();

      cy.url().should("include", `${getMeasuresBaseUrl(ORDERS_ID)}/new`);
    });

    it("should display measures and allow navigation to edit page", () => {
      createTestMeasure({
        name: "Total Revenue",
        aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
      });
      visitDataStudioMeasures(ORDERS_ID);

      cy.log("verify measure in list with aggregation description");
      MeasureList.getMeasure("Total Revenue")
        .scrollIntoView()
        .should("be.visible");
      MeasureList.get()
        .findByTestId("list-item-description")
        .should("contain", "Sum of Total");

      cy.log("navigate to edit page");
      MeasureList.getMeasure("Total Revenue").click();
      cy.get<number>("@measureId").then((measureId) => {
        cy.url().should(
          "include",
          `${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}`,
        );
      });
    });

    it("should navigate between Fields and Measures tabs", () => {
      visitDataStudioTable(ORDERS_ID);

      cy.log("verify both tabs visible");
      cy.findByRole("tab", { name: /Fields/i }).scrollIntoView();
      cy.findByRole("tab", { name: /Measures/i }).should("be.visible");

      cy.log("navigate to measures tab");
      cy.findByRole("tab", { name: /Measures/i }).click();
      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
      );
      MeasureList.getEmptyState().scrollIntoView().should("be.visible");

      cy.log("verify tab selection preserved on refresh");
      cy.reload();
      cy.wait("@metadata");
      cy.findByRole("tab", { name: /Measures/i })
        .scrollIntoView()
        .should("have.attr", "aria-selected", "true");

      cy.log("navigate back to fields tab");
      cy.findByRole("tab", { name: /Fields/i }).click();
      cy.url().should("include", "/field");
    });
  });

  describe("Measure creation", () => {
    it("should create a measure with aggregation and verify across features", () => {
      visitDataStudioMeasures(ORDERS_ID);

      cy.log("navigate to new measure page");
      MeasureList.getNewMeasureLink().scrollIntoView().click();

      cy.log("fill in measure name");
      MeasureEditor.getNameInput().type("Total Revenue");

      cy.log("add aggregation");
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Sum of ...").click();
      H.popover().findByText("Total").click();

      cy.log("verify aggregation was added");
      MeasureEditor.get()
        .findByText(/Sum of Total/i)
        .should("exist");

      cy.log("save measure");
      MeasureEditor.getSaveButton().click();
      cy.wait("@createMeasure");

      cy.log("verify redirect to edit page and toast");
      H.undoToast().should("contain.text", "Measure created");
      cy.url().should(
        "match",
        new RegExp(
          `${getMeasuresBaseUrl(ORDERS_ID).replace(/\//g, "\\/")}\/\\d+$`,
        ),
      );

      cy.log("verify measure in query builder");
      verifyMeasureInQueryBuilder("Total Revenue");
    });

    it("should add aggregation and show preview in menu", () => {
      visitDataStudioMeasures(PRODUCTS_ID);

      MeasureList.getNewMeasureLink().scrollIntoView().click();

      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Average of ...").click();
      H.popover().findByText("Price").click();

      cy.log("verify aggregation was added");
      MeasureEditor.get()
        .findByText(/Average of Price/i)
        .should("exist");

      cy.log("verify preview is available in menu");
      MeasureEditor.getActionsButton().click();
      H.popover().findByText("Preview").should("be.visible");
    });
  });

  describe("Measure editing", () => {
    it("should display and update existing measure", () => {
      createTestMeasure({
        name: "Test Measure",
        description: "Test description",
      });
      cy.get<number>("@measureId").then((measureId) => {
        visitDataModelMeasure(ORDERS_ID, measureId);
      });

      cy.log("verify existing data displayed");
      MeasureEditor.get()
        .findByDisplayValue("Test Measure")
        .should("be.visible");
      MeasureEditor.getDescriptionInput().should(
        "have.value",
        "Test description",
      );

      cy.log("update measure name (saves immediately on blur/enter)");
      MeasureEditor.get()
        .findByDisplayValue("Test Measure")
        .click()
        .type(" Updated{enter}");
      cy.wait("@updateMeasure");

      cy.log("verify toast for name update");
      H.undoToast().should("contain.text", "Measure name updated");

      cy.log("update description");
      MeasureEditor.getDescriptionInput().clear().type("Updated description");
      MeasureEditor.getSaveButton().click();
      cy.wait("@updateMeasure");

      cy.log("verify updated measure in query builder");
      verifyMeasureInQueryBuilder("Test Measure Updated");
    });

    it("should navigate back to measures tab via breadcrumb", () => {
      createTestMeasure({ name: "Breadcrumb Test Measure" });
      cy.get<number>("@measureId").then((measureId) => {
        visitDataModelMeasure(ORDERS_ID, measureId);
      });

      MeasureEditor.getBreadcrumb("Orders").click();

      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
      );
      cy.findByRole("tab", { name: /Measures/i })
        .scrollIntoView()
        .should("have.attr", "aria-selected", "true");
    });
  });

  describe("Measure deletion", () => {
    it("should remove measure via more menu", () => {
      createTestMeasure({ name: "Measure to Delete" });
      cy.get<number>("@measureId").then((measureId) => {
        visitDataModelMeasure(ORDERS_ID, measureId);
      });

      cy.log("delete via more menu");
      MeasureEditor.getActionsButton().click();
      H.popover().findByText("Remove measure").click();
      H.modal().button("Remove").click();
      cy.wait("@updateMeasure");

      cy.log("verify redirect to list and removal");
      H.undoToast().should("contain.text", "Measure removed");
      cy.url().should(
        "include",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
      );
      MeasureList.get()
        .findByText("Measure to Delete", { timeout: 1000 })
        .should("not.exist");

      cy.log("verify measure removed from query builder");
      verifyMeasureNotInQueryBuilder("Total Revenue");
    });
  });

  describe("Unsaved changes", () => {
    it("should show leave confirmation with unsaved changes", () => {
      visitDataStudioMeasures(ORDERS_ID);

      MeasureList.getNewMeasureLink().scrollIntoView().click();
      MeasureEditor.getNameInput().type("Unsaved Measure");

      cy.log("attempt to navigate away");
      MeasureEditor.getBreadcrumb("Orders").click();

      cy.log("verify confirmation modal");
      H.modal().within(() => {
        cy.findByText("Discard your changes?").should("be.visible");
        cy.button("Cancel").click();
      });

      cy.log("verify still on editor");
      MeasureEditor.get().findByText("Unsaved Measure").should("be.visible");
    });
  });

  describe("Measure with implicit joins", () => {
    it("should create a measure with implicit join aggregation", () => {
      visitDataStudioMeasures(ORDERS_ID);

      cy.log("navigate to new measure page");
      MeasureList.getNewMeasureLink().scrollIntoView().click();

      cy.log("fill in measure name");
      MeasureEditor.getNameInput().type("Average Product Price");

      cy.log("add aggregation via implicit join");
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Average of ...").click();
      H.popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Price").click();
      });

      cy.log("verify aggregation was added and save");
      MeasureEditor.get()
        .findByText(/Average of Product → Price/i)
        .should("exist");
      MeasureEditor.getSaveButton().click();
      cy.wait("@createMeasure");

      cy.log("verify redirected to edit page with measure name");
      MeasureEditor.get().should("be.visible");
      MeasureEditor.get()
        .findByDisplayValue("Average Product Price")
        .should("be.visible");

      cy.log("verify measure works in query builder");
      verifyMeasureInQueryBuilder("Average Product Price");
    });
  });

  describe("Revision history", () => {
    it("should display revision history with changes to name, description, and aggregation", () => {
      createTestMeasure({
        name: "Original Name",
        description: "Original description",
        aggregation: ["count"],
      });
      cy.get<number>("@measureId").then((measureId) => {
        // Fetch the measure to get the current pMBQL definition
        cy.request("GET", `/api/measure/${measureId}`).then(({ body }) => {
          const currentDefinition = body.definition;

          cy.log("update measure name");
          cy.request("PUT", `/api/measure/${measureId}`, {
            name: "Updated Name",
            description: "Original description",
            revision_message: "Updated from Data Studio",
            definition: currentDefinition,
          });

          cy.log("update measure description");
          cy.request("PUT", `/api/measure/${measureId}`, {
            name: "Updated Name",
            description: "Updated description",
            revision_message: "Updated from Data Studio",
            definition: currentDefinition,
          });

          cy.log("update measure aggregation");
          // Update aggregation in the pMBQL definition
          const updatedDefinition = {
            ...currentDefinition,
            stages: [
              {
                ...currentDefinition.stages[0],
                aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
              },
            ],
          };
          cy.request("PUT", `/api/measure/${measureId}`, {
            name: "Updated Name",
            description: "Updated description",
            revision_message: "Updated from Data Studio",
            definition: updatedDefinition,
          });

          cy.wait(1000);

          visitDataModelMeasure(ORDERS_ID, measureId);
        });
      });

      cy.log("navigate to revision history tab");
      MeasureEditor.getRevisionHistoryTab().click();

      cy.log("verify URL");
      cy.get<number>("@measureId").then((measureId) => {
        cy.url().should(
          "include",
          `${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}/revisions`,
        );
      });

      cy.log("verify revision history entries");
      MeasureRevisionHistory.get().within(() => {
        cy.findByText(/created this measure/i)
          .scrollIntoView()
          .should("be.visible");
        cy.findByText(/renamed the measure/i)
          .scrollIntoView()
          .should("be.visible");
        cy.findByText(/changed the aggregation/i)
          .scrollIntoView()
          .should("be.visible");
        cy.findByText(/updated the description/i)
          .scrollIntoView()
          .should("be.visible");
      });
    });
  });

  describe("Dependencies", () => {
    it("should display dependency graph for a measure", () => {
      createTestMeasure({ name: "Dependencies Test Measure" });
      cy.get<number>("@measureId").then((measureId) => {
        visitDataModelMeasure(ORDERS_ID, measureId);
      });

      cy.log("navigate to dependencies tab");
      MeasureEditor.getDependenciesTab().click();

      cy.log("verify URL and dependency graph display");
      cy.get<number>("@measureId").then((measureId) => {
        cy.url().should(
          "include",
          `${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}/dependencies`,
        );
      });
      H.DependencyGraph.graph().should("be.visible");
      H.DependencyGraph.graph()
        .findByText("Dependencies Test Measure")
        .should("be.visible");
    });
  });

  describe("Readonly access for data analysts", () => {
    it("should show measures in list but hide New measure button for non-admin", () => {
      createTestMeasure({ name: "Readonly Test Measure" });

      H.setUserAsAnalyst(NODATA_USER_ID);
      cy.signIn("nodata");

      cy.log("verify measure is visible in list");
      visitDataStudioMeasures(ORDERS_ID);
      MeasureList.getMeasure("Readonly Test Measure")
        .scrollIntoView()
        .should("be.visible");

      cy.log("verify New measure button is not visible");
      MeasureList.get()
        .findByRole("link", { name: /New measure/i })
        .should("not.exist");

      cy.log("verify direct navigation to new measure page is blocked");
      cy.visit(
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures/new`,
      );
      cy.url().should("include", "/unauthorized");
    });

    it("should display measure detail in readonly mode for non-admin", () => {
      createTestMeasure({
        name: "Readonly Detail Measure",
        description: "Test description for readonly",
      });

      cy.get<number>("@measureId").then((measureId) => {
        H.setUserAsAnalyst(NODATA_USER_ID);
        cy.signIn("nodata");

        visitDataModelMeasure(ORDERS_ID, measureId);

        cy.log("verify measure name input is disabled");
        MeasureEditor.get()
          .findByDisplayValue("Readonly Detail Measure")
          .should("be.disabled");

        cy.log("verify description is displayed as plain text");
        MeasureEditor.get().findByText("Description").should("be.visible");
        MeasureEditor.get()
          .findByText("Test description for readonly")
          .should("be.visible");

        cy.log("verify Save button is not visible");
        MeasureEditor.get()
          .findByRole("button", { name: /Save/i })
          .should("not.exist");

        cy.log("verify Remove measure option is hidden in actions menu");
        MeasureEditor.getActionsButton().click();
        H.popover().findByText("Preview").should("be.visible");
        H.popover().findByText("Remove measure").should("not.exist");
        cy.realPress("Escape");

        cy.log("verify revision history is still accessible");
        MeasureEditor.getRevisionHistoryTab().click();
        MeasureRevisionHistory.get().within(() => {
          cy.findByText(/created this measure/i)
            .scrollIntoView()
            .should("be.visible");
        });
      });
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

function visitDataStudioMeasures(tableId: number) {
  H.DataModel.visitDataStudioMeasures({
    databaseId: SAMPLE_DB_ID,
    schemaId: SAMPLE_DB_SCHEMA_ID,
    tableId,
  });
}

function getMeasuresBaseUrl(tableId: number) {
  return `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}/measures`;
}

function visitDataModelMeasure(tableId: number, measureId: number) {
  cy.visit(`${getMeasuresBaseUrl(tableId)}/${measureId}`);
}

function createTestMeasure(
  opts: {
    name?: string;
    description?: string;
    tableId?: number;
    aggregation?: unknown[];
  } = {},
) {
  const {
    name = "Test Measure",
    description,
    tableId = ORDERS_ID,
    aggregation = ["sum", ["field", ORDERS.TOTAL, null]],
  } = opts;

  H.createMeasure({
    name,
    description,
    table_id: tableId,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        aggregation: [aggregation],
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("measureId");
  });
}

function verifyMeasureInQueryBuilder(
  measureName: string,
  tableId: number = ORDERS_ID,
) {
  H.openTable({ table: tableId, mode: "notebook" });

  H.getNotebookStep("data").button("Summarize").click();
  H.popover().within(() => {
    cy.findByText("Measures").click();
    cy.findByText(measureName).click();
  });
  H.visualize();
  cy.findByTestId("scalar-value").should("be.visible");
}

function verifyMeasureNotInQueryBuilder(
  measureName: string,
  tableId: number = ORDERS_ID,
) {
  H.openTable({ table: tableId, mode: "notebook" });

  H.getNotebookStep("data").button("Summarize").click();
  H.popover().findByText(measureName).should("not.exist");
}
