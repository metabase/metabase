import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { MeasureList, MeasureEditor, MeasureRevisionHistory } = H.DataModel;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > data model > measures", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.intercept("POST", "/api/measure").as("createMeasure");
    cy.intercept("PUT", "/api/measure/*").as("updateMeasure");
  });

  it("should create a measure with aggregation and verify it in the query builder", () => {
    visitDataStudioMeasures(ORDERS_ID);

    cy.log("navigate to new measure page");
    MeasureList.getNewMeasureLink().scrollIntoView().click();

    cy.log("verify measure_create_started event");
    H.expectUnstructuredSnowplowEvent({
      event: "measure_create_started",
      triggered_from: "data_studio_measures_list",
      target_id: ORDERS_ID,
    });
    cy.url().should("include", `${getMeasuresBaseUrl(ORDERS_ID)}/new`);

    cy.log("fill in measure name and add aggregation");
    MeasureEditor.getNameInput().type("Total Revenue");
    MeasureEditor.getAggregationPlaceholder().click();
    H.popover().findByText("Sum of ...").click();
    H.popover().findByText("Total").click();
    MeasureEditor.get()
      .findByText(/Sum of Total/i)
      .should("exist");

    cy.log("save measure");
    MeasureEditor.getSaveButton().click();
    cy.wait("@createMeasure").then((interception) => {
      const measureId = interception.response?.body?.id;

      cy.log("verify measure_created success event");
      H.expectUnstructuredSnowplowEvent({
        event: "measure_created",
        triggered_from: "data_studio_measures",
        result: "success",
        target_id: measureId,
      });
    });

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

  it("should update a measure, record its revisions, and remove it", () => {
    createTestMeasure({ name: "Kept Measure" });
    createTestMeasure({
      name: "Test Measure",
      description: "Test description",
    });
    cy.get<number>("@measureId").then((measureId) => {
      visitDataModelMeasure(ORDERS_ID, measureId);
    });

    cy.log("update measure name (saves immediately on enter)");
    MeasureEditor.get()
      .findByDisplayValue("Test Measure")
      .click()
      .type(" Updated{enter}");
    cy.wait("@updateMeasure");

    cy.log("update description");
    MeasureEditor.getDescriptionInput().clear().type("Updated description");
    MeasureEditor.getSaveButton().click();
    cy.wait("@updateMeasure");

    cy.log("verify the changes are stored");
    cy.reload();
    MeasureEditor.get()
      .findByDisplayValue("Test Measure Updated")
      .should("be.visible");
    MeasureEditor.getDescriptionInput().should(
      "have.value",
      "Updated description",
    );

    cy.log("verify the revisions recorded by the backend");
    MeasureEditor.getRevisionHistoryTab().click();
    MeasureRevisionHistory.get().within(() => {
      cy.findByText(/created this measure/i)
        .scrollIntoView()
        .should("be.visible");
      cy.findByText(/renamed the measure/i)
        .scrollIntoView()
        .should("be.visible");
      cy.findByText(/updated the description/i)
        .scrollIntoView()
        .should("be.visible");
    });

    cy.log("verify the renamed measure in the query builder");
    verifyMeasureInQueryBuilder("Test Measure Updated");

    cy.log("remove the measure");
    cy.get<number>("@measureId").then((measureId) => {
      visitDataModelMeasure(ORDERS_ID, measureId);
    });
    MeasureEditor.getActionsButton().click();
    H.popover().findByText("Remove measure").click();
    H.modal().button("Remove").click();
    cy.wait("@updateMeasure");

    cy.log("verify the list after removal");
    cy.url().should("include", getMeasuresBaseUrl(ORDERS_ID));
    MeasureList.getMeasure("Kept Measure")
      .scrollIntoView()
      .should("be.visible");
    MeasureList.get()
      .findByTestId("list-item-description")
      .should("contain", "Sum of Total");
    MeasureList.get().findByText("Test Measure Updated").should("not.exist");

    cy.log("verify measure removed from query builder");
    verifyMeasureNotInQueryBuilder({
      removedMeasureName: "Test Measure Updated",
      keptMeasureName: "Kept Measure",
    });
  });

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

  it("should show measures read-only to a data analyst", () => {
    createTestMeasure({ name: "Readonly Test Measure" });

    H.setUserAsAnalyst(NODATA_USER_ID);
    cy.signIn("nodata");

    cy.log("verify measure is visible in list");
    visitDataStudioMeasures(ORDERS_ID);
    MeasureList.getMeasure("Readonly Test Measure").scrollIntoView().click();

    cy.log("verify measure name input is disabled");
    MeasureEditor.get()
      .findByDisplayValue("Readonly Test Measure")
      .should("be.disabled");

    cy.log("verify revision history is accessible");
    MeasureEditor.getRevisionHistoryTab().click();
    MeasureRevisionHistory.get().within(() => {
      cy.findByText(/created this measure/i)
        .scrollIntoView()
        .should("be.visible");
    });
  });
});

describe("scenarios > data studio > library > published tables > measures", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.createLibrary();
    H.publishTables({ table_ids: [ORDERS_ID] });
  });

  it("should open a measure from a published table and go back through the collection breadcrumbs", () => {
    createTestMeasure({ name: "Total Revenue" });
    H.DataStudio.Tables.visitMeasuresPage(ORDERS_ID);

    MeasureList.getMeasure("Total Revenue").click();
    cy.get<number>("@measureId").then((measureId) => {
      cy.url().should(
        "include",
        `/data-studio/library/tables/${ORDERS_ID}/measures/${measureId}`,
      );
    });

    MeasureEditor.get().findByText("Data").should("be.visible");
    MeasureEditor.getBreadcrumb("Orders").click();

    cy.url().should(
      "include",
      `/data-studio/library/tables/${ORDERS_ID}/measures`,
    );
    cy.url().should("not.match", /measures\/\d+/);
  });
});

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

function verifyMeasureNotInQueryBuilder({
  removedMeasureName,
  keptMeasureName,
}: {
  removedMeasureName: string;
  keptMeasureName: string;
}) {
  H.openTable({ table: ORDERS_ID, mode: "notebook" });

  H.getNotebookStep("data").button("Summarize").click();
  H.popover().within(() => {
    cy.findByText("Measures").click();
    cy.findByText(keptMeasureName).should("be.visible");
    cy.findByText(removedMeasureName).should("not.exist");
  });
}
