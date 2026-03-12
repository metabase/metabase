import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { MeasureList, MeasureEditor } = H.DataModel;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// Majority of the measures pages functionality is covered in the data-model/measures-data-studio.cy.spec.ts spec
// This spec is focused on the published tables measures pages functionality while doing some smoke tests
describe("scenarios > data studio > library > published tables > measures", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.createLibrary();
    H.publishTables({ table_ids: [ORDERS_ID] });

    cy.intercept("POST", "/api/measure").as("createMeasure");
    cy.intercept("PUT", "/api/measure/*").as("updateMeasure");
  });

  describe("Measure list", () => {
    it("should show empty state and navigate to new measure page", () => {
      H.DataStudio.Tables.visitMeasuresPage(ORDERS_ID);

      MeasureList.getEmptyState().scrollIntoView().should("be.visible");
      MeasureList.getNewMeasureLink().scrollIntoView().click();

      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/measures/new`,
      );
    });

    it("should display measures and navigate to edit page", () => {
      createTestMeasure({ name: "Total Revenue" });
      H.DataStudio.Tables.visitMeasuresPage(ORDERS_ID);

      MeasureList.getMeasure("Total Revenue").click();

      cy.get<number>("@measureId").then((measureId) => {
        cy.url().should(
          "include",
          `/data-studio/library/tables/${ORDERS_ID}/measures/${measureId}`,
        );
      });
    });

    it("should navigate between Overview, Fields, and Measures tabs", () => {
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);

      H.DataStudio.Tables.overviewTab().should("be.visible");
      H.DataStudio.Tables.fieldsTab().should("be.visible");
      H.DataStudio.Tables.measuresTab().should("be.visible");

      H.DataStudio.Tables.measuresTab().click();
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/measures`,
      );

      H.DataStudio.Tables.overviewTab().click();
      cy.url().should("include", `/data-studio/library/tables/${ORDERS_ID}`);
      cy.url().should("not.include", "/measures");
    });
  });

  describe("Measure creation", () => {
    it("should create a measure and redirect to edit page", () => {
      H.DataStudio.Tables.visitMeasuresPage(ORDERS_ID);
      MeasureList.getNewMeasureLink().click();

      MeasureEditor.getNameInput().type("Total Revenue");
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Sum of ...").click();
      H.popover().findByText("Total").click();

      MeasureEditor.getSaveButton().click();
      cy.wait("@createMeasure");

      H.undoToast().should("contain.text", "Measure created");
      cy.url().should(
        "match",
        new RegExp(`/data-studio/library/tables/${ORDERS_ID}/measures/\\d+$`),
      );
    });
  });

  describe("Breadcrumbs", () => {
    it("should display collection-based breadcrumbs", () => {
      createTestMeasure({ name: "Breadcrumb Test Measure" });
      cy.get<number>("@measureId").then((measureId) => {
        H.DataStudio.Tables.visitMeasurePage(ORDERS_ID, measureId);
      });

      MeasureEditor.get().findByText("Data").should("be.visible");
    });

    it("should navigate back to published table measures via breadcrumb", () => {
      createTestMeasure({ name: "Breadcrumb Nav Test" });
      cy.get<number>("@measureId").then((measureId) => {
        H.DataStudio.Tables.visitMeasurePage(ORDERS_ID, measureId);
      });

      MeasureEditor.getBreadcrumb("Orders").click();

      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/measures`,
      );
      cy.url().should("not.match", /measures\/\d+/);
    });
  });

  describe("Measure deletion", () => {
    it("should redirect to published table measures list after deletion", () => {
      createTestMeasure({ name: "Measure to Delete" });
      cy.get<number>("@measureId").then((measureId) => {
        H.DataStudio.Tables.visitMeasurePage(ORDERS_ID, measureId);
      });

      MeasureEditor.getActionsButton().click();
      H.popover().findByText("Remove measure").click();
      H.modal().button("Remove").click();
      cy.wait("@updateMeasure");

      H.undoToast().should("contain.text", "Measure removed");
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/measures`,
      );
      cy.url().should("not.match", /measures\/\d+/);
    });
  });
});

function createTestMeasure(opts: { name?: string; description?: string } = {}) {
  const { name = "Test Measure", description } = opts;

  H.createMeasure({
    name,
    description,
    table_id: ORDERS_ID,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("measureId");
  });
}
