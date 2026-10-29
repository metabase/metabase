import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_SCHEMA = "Schema A";

describe("scenarios > admin > transforms incremental", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("POST", "/api/transform").as("createTransform");
    cy.intercept("POST", "/api/transform/*/reset-checkpoint").as(
      "resetCheckpoint",
    );
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("creation", () => {
    it("should be able to create and run an mbql incremental transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "query",
      });

      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("MBQL");

        cy.log("should auto-populate table name based on transform name...");
        cy.findByLabelText("Table name").should("have.value", "mbql");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);

        cy.log("...unless user has manually modified the table name");
        cy.findByLabelText("Name").type(" transform");
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByRole("switch", {
          name: /Only process new data/i,
        }).click({ force: true });

        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform");
      H.DataStudio.Transforms.runTab().click();
      H.runTransformFromUiAndWaitForStatus("succeeded");
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
      });

      cy.findByRole("link", { name: "See all runs" }).click();

      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findByRole("row", { name: /MBQL transform/i }).click();
      });

      cy.findByRole("region", { name: "Info" }).within(() => {
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/30/).should("be.visible");
        });
      });

      cy.log(
        "add one element to the source table and run incremental transform again",
      );
      H.queryWritableDB(
        'INSERT INTO "Schema A"."Animals" (name, score) VALUES (\'NewRow\', 31)',
      );

      cy.go("back");
      H.DataStudio.Transforms.runTab().click();
      H.runTransformFromUiAndWaitForStatus("succeeded");

      cy.log(
        "verify the new element was picked up in the incremental transfer",
      );
      cy.findByRole("link", { name: "See all runs" }).click();
      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findAllByRole("row", { name: /MBQL transform/i })
          .first()
          .click();
      });
      cy.findByRole("region", { name: "Info" }).within(() => {
        cy.findByRole("group", { name: "Checkpoint from" }).within(() => {
          cy.findByText(/30/).should("be.visible");
        });
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/31/).should("be.visible");
        });
      });

      cy.log("go to Transform Settings and reset checkpoint");
      cy.go("back");
      H.DataStudio.Transforms.settingsTab().click();
      cy.findByRole("group", { name: /Last processed/i }).within(() => {
        cy.findByText(/31/).should("exist");
      });
      cy.button("Reprocess all data").click();
      H.modal().within(() => {
        cy.button("Reprocess on next run").click();
      });
      cy.wait("@resetCheckpoint");
      H.undoToast().should("contain.text", "Checkpoint has been reset");

      cy.log(
        "go to Runs tab, run transform again and check new run has checkpoint to 31",
      );
      H.DataStudio.Transforms.runTab().click();
      H.runTransformFromUiAndWaitForStatus("succeeded");
      cy.findByRole("link", { name: "See all runs" }).click();
      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findAllByRole("row", { name: /MBQL transform/i })
          .first()
          .click();
      });
      cy.findByRole("region", { name: "Info" }).within(() => {
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/31/).should("be.visible");
        });
        cy.findByRole("group", { name: "Checkpoint from" }).should("not.exist");
      });
    });
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
