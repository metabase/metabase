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

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/transform").as("createTransform");
    cy.intercept("PUT", "/api/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/transform/*/table").as("deleteTransformTable");
    cy.intercept("POST", "/api/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag");
    cy.intercept("POST", "/api/ee/dependencies/check-transform").as(
      "checkTransformDependencies",
    );
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
          name: /Only process new and changed data/i,
        }).click({ force: true });

        cy.button("Save").click();
        cy.wait("@createTransform").then(({ response }) => {
          const transformId = response?.body?.id;
          if (transformId != null) {
            cy.wrap(transformId).as("transformId");
          }
        });
      });

      cy.log("run the transform and make sure its table can be queried");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

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
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/31/).should("be.visible");
        });
      });

      cy.log("go to Transform Settings and reset checkpoint");
      cy.go("back");
      H.DataStudio.Transforms.settingsTab().click();
      cy.findByRole("group", { name: /Current checkpoint/i }).within(() => {
        cy.findByText(/31/).should("exist");
      });
      cy.button("Reset checkpoint").click();
      H.modal().within(() => {
        cy.button("Reset").click();
      });
      cy.wait("@resetCheckpoint");

      cy.log(
        "go to Runs tab, run transform again and check new run has checkpoint to 31",
      );
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
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
      });
    });

    it(
      "should be able to create and run a Python incremental transform",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("create a new transform");
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();

        H.expectUnstructuredSnowplowEvent({
          event: "transform_create",
          event_detail: "python",
        });

        cy.findByTestId("python-transform-top-bar")
          .findByText("Writable Postgres12")
          .click();
        H.popover().findByText(DB_NAME).click();

        getPythonDataPicker().findByText("Select a table…").click();
        H.entityPickerModal().findByText(SOURCE_TABLE).click();

        H.PythonEditor.clear().paste(
          `import pandas as pd

def transform(animals):
    return pd.DataFrame([{"name": "test", "score": 0}])`,
        );

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Python transform");
          cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
          cy.findByRole("switch", {
            name: /Only process new and changed data/i,
          }).click({ force: true });
          cy.button("Save").click();
          cy.wait("@createTransform").then(({ response }) => {
            const transformId = response?.body?.id;
            if (transformId != null) {
              cy.wrap(transformId).as("transformId");
            }
          });
        });

        cy.log("run the transform and make sure its table can be queried");
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_trigger_manual_run",
        });

        cy.findByRole("link", { name: "See all runs" }).click();

        cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
          cy.findByRole("row", { name: /Python transform/i }).click();
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
        runTransformAndWaitForSuccess();

        cy.log(
          "verify the new element was picked up in the incremental transfer",
        );
        cy.findByRole("link", { name: "See all runs" }).click();
        cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
          cy.findAllByRole("row", { name: /Python transform/i })
            .first()
            .click();
        });
        cy.findByRole("region", { name: "Info" }).within(() => {
          cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
            cy.findByText(/31/).should("be.visible");
          });
        });

        cy.log("go to Transform Settings and reset checkpoint");
        cy.go("back");
        H.DataStudio.Transforms.settingsTab().click();
        cy.findByRole("group", { name: /Current checkpoint/i }).within(() => {
          cy.findByText(/31/).should("exist");
        });
        cy.button("Reset checkpoint").click();
        H.modal().within(() => {
          cy.button("Reset").click();
        });
        cy.wait("@resetCheckpoint");

        cy.log(
          "go to Runs tab, run transform again and check new run has checkpoint to 31",
        );
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        cy.findByRole("link", { name: "See all runs" }).click();
        cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
          cy.findAllByRole("row", { name: /Python transform/i })
            .first()
            .click();
        });
        cy.findByRole("region", { name: "Info" }).within(() => {
          cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
            cy.findByText(/31/).should("be.visible");
          });
        });
      },
    );

    it("should be able to create and run a native SQL incremental transform", () => {
      const SCHEMA_B = "Schema B";
      cy.log("create a new transform");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("SQL query").click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "native",
      });

      H.popover().findByText(DB_NAME).click();
      H.NativeEditor.type("SELECT * FROM {{t}}", {
        allowFastSet: true,
      }).blur();

      cy.log("configure table variable for incremental support");
      cy.findByTestId("native-query-top-bar")
        .findByLabelText("Variables")
        .click();
      editorSidebar().findByLabelText("Variable type").click();
      H.popover().findByText("Table").click();
      H.popover().findByText(SCHEMA_B).click();
      H.popover().findByText(SOURCE_TABLE).click();

      getQueryEditor().button("Save").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("SQL transform");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.findByRole("switch", {
          name: /Only process new and changed data/i,
        }).click({ force: true });
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
      });

      cy.findByRole("link", { name: "See all runs" }).click();
      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findByRole("row", { name: /SQL transform/i }).click();
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
        `INSERT INTO "${SCHEMA_B}"."Animals" (name, score) VALUES (\'NewRow\', 31)`,
      );

      cy.go("back");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log(
        "verify the new element was picked up in the incremental transfer",
      );
      cy.findByRole("link", { name: "See all runs" }).click();
      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findAllByRole("row", { name: /SQL transform/i })
          .first()
          .click();
      });
      cy.findByRole("region", { name: "Info" }).within(() => {
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/31/).should("be.visible");
        });
      });

      cy.log("go to Transform Settings and reset checkpoint");
      cy.go("back");
      H.DataStudio.Transforms.settingsTab().click();
      cy.findByRole("group", { name: /Current checkpoint/i }).within(() => {
        cy.findByText(/31/).should("exist");
      });
      cy.button("Reset checkpoint").click();
      H.modal().within(() => {
        cy.button("Reset").click();
      });
      cy.wait("@resetCheckpoint");

      cy.log(
        "go to Runs tab, run transform again and check new run has checkpoint to 31",
      );
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      cy.findByRole("link", { name: "See all runs" }).click();
      cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
        cy.findAllByRole("row", { name: /SQL transform/i })
          .first()
          .click();
      });
      cy.findByRole("region", { name: "Info" }).within(() => {
        cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
          cy.findByText(/31/).should("be.visible");
        });
      });
    });
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function runTransformAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function getRunButton(options: { timeout?: number } = {}) {
  return cy.findAllByTestId("run-button").eq(0, options);
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function editorSidebar() {
  return cy.findByTestId("editor-sidebar");
}

function getPythonDataPicker() {
  return cy.findByTestId("python-data-picker");
}
