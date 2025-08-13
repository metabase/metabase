const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { CardType, TransformTagId } from "metabase-types/api";

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/ee/transform").as("createTransform");
    cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/ee/transform/*/table").as(
      "deleteTransformTable",
    );
    cy.intercept("POST", "/api/ee/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/ee/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/ee/transform-tag/*").as("deleteTag");
  });

  describe("creation", () => {
    it("should be able to create and run an mbql transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();
      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create and run a SQL transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("SQL query").click();
      H.popover().findByText(DB_NAME).click();
      H.NativeEditor.type(`SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`);
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("SQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create and run a transform from a question or a model", () => {
      function testCardSource({
        type,
        label,
      }: {
        type: CardType;
        label: string;
      }) {
        cy.log("create a query in the target database");
        H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).then(
          (tableId) =>
            H.createQuestion({
              name: "Test",
              type,
              database: WRITABLE_DB_ID,
              query: {
                "source-table": tableId,
              },
            }),
        );

        cy.log("create a new transform");
        visitTransformListPage();
        getTransformListPage().button("Create a transform").click();
        H.popover().findByText("A saved question").click();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab(label);
          cy.findByText("Test").click();
        });
        getQueryEditor().button("Save").click();
        H.modal().within(() => {
          cy.findByLabelText("Name").type(`${type} transform`);
          cy.findByLabelText("Table name").type(`${type}_transform`);
          cy.button("Save").click();
          cy.wait("@createTransform");
        });

        cy.log("run the transform and make sure its table can be queried");
        runAndWaitForSuccess();
        getTableLink().click();
        H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
        H.assertQueryBuilderRowCount(3);
      }

      testCardSource({ type: "question", label: "Questions" });
      testCardSource({ type: "model", label: "Models" });
    });

    it("should not allow to overwrite an existing table when creating a transform", () => {
      cy.log("open the new transform page");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("set the query");
      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(SOURCE_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
        cy.findByText("A table with that name already exists.").should(
          "be.visible",
        );
      });
    });
  });

  describe("name and description", () => {
    it("should be able to edit the name and description after creation", () => {
      createMbqlTransform({ visitTransform: true });

      getTransformPage()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Transform name updated").should("be.visible");
      getTransformPage()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");

      getTransformPage()
        .findByPlaceholderText("No description yet")
        .clear()
        .type("New description")
        .blur();
      H.undoToastList()
        .should("have.length", 2)
        .last()
        .findByText("Transform description updated")
        .should("be.visible");
      getTransformPage()
        .findByPlaceholderText("No description yet")
        .should("have.value", "New description");
    });
  });

  describe("tags", () => {
    it("should be able to add and remove tags", () => {
      createTransformTags(["main", "replica"]);
      createMbqlTransform({ visitTransform: true });
      getTagsInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: "main" }).click();
        cy.wait("@updateTransform");
        assertOptionSelected("main");
        assertOptionNotSelected("replica");

        cy.findByRole("option", { name: "replica" }).click();
        cy.wait("@updateTransform");
        assertOptionSelected("main");
        assertOptionSelected("replica");

        cy.findByRole("option", { name: "main" }).click();
        cy.wait("@updateTransform");
        assertOptionNotSelected("main");
        assertOptionSelected("replica");
      });
    });

    it("should be able to create tags inline", () => {
      createMbqlTransform({ visitTransform: true });
      getTagsInput().type("New tag");
      H.popover().findByText("New tag").click();
      cy.wait("@createTag");
      H.popover().findByText("New tag").should("be.visible");
      H.undoToast().should("contain.text", "Transform tags updated");
    });

    it("should be able to update tags inline", () => {
      createTransformTags(["main"]);
      createMbqlTransform({ visitTransform: true });

      getTagsInput().click();
      H.popover()
        .findByRole("option", { name: "main" })
        .findByLabelText("Rename tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("main2");
        cy.button("Save").click();
        cy.wait("@updateTag");
      });

      getTagsInput().click();
      H.popover().findByText("main2").should("be.visible");
    });

    it("should be able to delete tags inline", () => {
      createTransformTags(["main", "replica"]);
      createMbqlTransform({ visitTransform: true });

      getTagsInput().click();
      H.popover()
        .findByRole("option", { name: "main" })
        .findByLabelText("Delete tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.button("Delete tag").click();
        cy.wait("@deleteTag");
      });
      H.undoToast().should("contain.text", "Transform tags updated");

      getTagsInput().click();
      H.popover().within(() => {
        cy.findByText("replica").should("be.visible");
        cy.findByText("main").should("not.exist");
      });
    });
  });

  describe("targets", () => {
    it("should be able to change the target before running a transform", () => {
      cy.log("create but do not run the transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("modify the transform before running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Schema").click();
      });
      H.popover().findByText(TARGET_SCHEMA_2).click();
      H.modal().within(() => {
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE_2);
      getSchemaLink().should("have.text", TARGET_SCHEMA_2);

      cy.log("run the transform and verify the table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(TARGET_SCHEMA_2).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and keep the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Keep transform_table").should("be.checked");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE_2);

      cy.log("run the transform and verify the new table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question still works");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and delete the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete the old one").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE_2);

      cy.log("run the transform and verify the new table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question still works");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });

    it("should be able to delete the target and restore the same target back", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the old target without creating the new one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete the old one").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });

      cy.log("change the target back to the original one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });

      cy.log("run the transform to re-create the original target");
      runAndWaitForSuccess();

      cy.log("verify the target is available");
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should not allow to overwrite an existing table when changing the target", () => {
      createMbqlTransform({ visitTransform: true });

      cy.log("change the target to an existing table");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").clear().type(SOURCE_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
        cy.findByText("A table with that name already exists.").should(
          "be.visible",
        );
      });
    });
  });

  describe("metadata", () => {
    it("should be able to edit table metadata after table creation", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      getTransformPage()
        .findByText("Edit this table’s metadata")
        .should("not.exist");

      cy.log("after table creation");
      runAndWaitForSuccess();
      getTransformPage().findByText("Edit this table’s metadata").click();
      H.DataModel.TableSection.clickField("Name");
      H.DataModel.FieldSection.getNameInput().clear().type("New name").blur();
      cy.wait("@updateField");

      cy.log("verify query metadata");
      cy.go("back");
      cy.go("back");
      getTableLink().click();
      H.assertTableData({ columns: ["New name", "Score"] });
    });

    it("should be able to see the target schema", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      getSchemaLink().should("have.text", TARGET_SCHEMA);
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("not.exist");
      });

      cy.log("after table creation");
      cy.go("back");
      runAndWaitForSuccess();
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("be.visible");
      });
    });

    it("should be able to see the target database", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      getDatabaseLink().should("have.text", DB_NAME);
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });

      cy.log("after table creation");
      cy.go("back");
      runAndWaitForSuccess();
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });
    });
  });

  describe("queries", () => {
    it("should be able to update a MBQL query", () => {
      cy.log("create a new transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("update the query");
      getTransformPage().findByRole("link", { name: "Edit query" }).click();
      H.getNotebookStep("data").button("Filter").click();
      H.popover().within(() => {
        cy.findByText("Name").click();
        cy.findByText("Duck").click();
        cy.button("Add filter").click();
      });

      getQueryEditor().button("Save changes").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to update a SQL query", () => {
      cy.log("create a new transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        visitTransform: true,
      });

      cy.log("update the query");
      getTransformPage().findByRole("link", { name: "Edit query" }).click();
      H.NativeEditor.type(" WHERE name = 'Duck'");
      getQueryEditor().button("Save changes").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });
  });

  describe("runs", () => {
    it("should be able to navigate to a list of runs", () => {
      cy.log("create and run a transform");
      createMbqlTransform({
        targetTable: TARGET_TABLE,
        visitTransform: true,
      });
      runAndWaitForSuccess();

      cy.log("create and run another transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
        visitTransform: true,
      });
      runAndWaitForSuccess();

      cy.log("assert that the list is filtered by the current transform");
      getRunListLink().click();
      getContentTable().within(() => {
        cy.findByText("SQL transform").should("be.visible");
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("Success").should("be.visible");
        cy.findByText("Manual").should("be.visible");
      });
    });

    it("should display the error message from a failed run", () => {
      createSqlTransform({
        sourceQuery: "SELECT * FROM abc",
        visitTransform: true,
      });
      runAndWaitForFailure();
      getRunErrorInfoButton().click();
      H.modal().should("contain.text", 'relation "abc" does not exist');
    });
  });

  describe("deletion", () => {
    it("should be able to delete a transform before creating the table", () => {
      cy.log("create a transform without running");
      createMbqlTransform({ visitTransform: true });

      cy.log("delete the transform");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("not.exist");
        cy.findByLabelText("Delete the transform and the table").should(
          "not.exist",
        );
        cy.button("Delete transform").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");
      getTransformListPage().findByText("MBQL transform").should("not.exist");
    });

    it("should be able to delete a transform and keep the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the transform but keep the table");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("be.checked");
        cy.button("Delete transform only").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

      cy.log("make sure the table still exists");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to delete a transform and delete the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the transform and the table");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform and the table").click();
        cy.button("Delete transform and table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

      cy.log("make sure the table is deleted");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });
  });
});

describe("scenarios > admin > transforms > jobs", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    cy.intercept("POST", "/api/ee/transform-job").as("createJob");
    cy.intercept("PUT", "/api/ee/transform-job/*").as("updateJob");
    cy.intercept("DELETE", "/api/ee/transform-job/*").as("deleteJob");
  });

  describe("creation", () => {
    it("should be able to create a job with default properties", () => {
      visitJobListPage();
      getJobListPage().findByRole("link", { name: "Create a job" }).click();

      getJobPage().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "New job");
        cy.findByPlaceholderText("No description yet").should("have.value", "");
        getCronInput().should("have.value", "0 0 * * ?");
        cy.findByText("This job will run at 12:00 AM").should("be.visible");
      });
    });

    it("should be able to create a job with custom property values", () => {
      createTransformTags(["main", "replica"]);
      visitJobListPage();
      getJobListPage().findByRole("link", { name: "Create a job" }).click();

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").clear().type("Job");
        cy.findByPlaceholderText("No description yet")
          .clear()
          .type("Description");
        getCronInput().clear().type("0 * * * ?");
        getTagsInput().click();
      });
      H.popover().findByText("replica").click();
      getJobPage().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "Job");
        cy.findByPlaceholderText("No description yet").should(
          "have.value",
          "Description",
        );
        getCronInput().should("have.value", "0 * * * ?");
        cy.findByText("This job will run every hour").should("be.visible");
        cy.findByText("replica").should("be.visible");
      });
    });
  });

  describe("name and description", () => {
    it("should be able to edit the name and description after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });

      getJobPage()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Job name updated").should("be.visible");
      getJobPage()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");

      getJobPage()
        .findByPlaceholderText("No description yet")
        .clear()
        .type("New description")
        .blur();
      H.undoToastList()
        .should("have.length", 2)
        .last()
        .findByText("Job description updated")
        .should("be.visible");
      getJobPage()
        .findByPlaceholderText("No description yet")
        .should("have.value", "New description");
    });
  });

  describe("schedule", () => {
    it("should be able to change the schedule after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      getJobPage().within(() => {
        getCronInput().clear().type("0 * * * ?").blur();
        cy.findByText("This job will run every hour").should("be.visible");
      });
      H.undoToast().findByText("Job schedule updated").should("be.visible");
      getJobPage().within(() => {
        getCronInput().should("have.value", "0 * * * ?");
      });
    });
  });

  describe("tags", () => {
    it("should be able to add and remove tags", () => {
      createTransformTags(["main", "replica"]);
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      getTagsInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: "main" }).click();
        cy.wait("@updateJob");
        assertOptionSelected("main");
        assertOptionNotSelected("replica");

        cy.findByRole("option", { name: "replica" }).click();
        cy.wait("@updateJob");
        assertOptionSelected("main");
        assertOptionSelected("replica");

        cy.findByRole("option", { name: "main" }).click();
        cy.wait("@updateJob");
        assertOptionNotSelected("main");
        assertOptionSelected("replica");
      });
    });
  });

  describe("runs", () => {
    it("should be able to manually run a job", () => {
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        createMbqlTransform({
          tagIds: [tag.id],
        });
        H.createTransformJob(
          { name: "New job", tag_ids: [tag.id] },
          { visitTransformJob: true },
        );
      });
      runAndWaitForSuccess();
      getSidebar().findByText("Runs").click();
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("Success").should("be.visible");
        cy.findByText("Manual").should("be.visible");
      });
    });
  });

  describe("deletion", () => {
    it("should be able to delete a job", () => {
      cy.log("create a job with a tag");
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        H.createTransformJob(
          { name: "New job", tag_ids: [tag.id] },
          { visitTransformJob: true },
        );
      });

      cy.log("delete the job");
      getJobPage().button("Delete this job").click();
      H.modal().within(() => {
        cy.button("Delete job").click();
        cy.wait("@deleteJob");
      });
      getJobListPage().should("be.visible");
      getJobListPage().findByText("New job").should("not.exist");
    });
  });
});

function getTransformListPage() {
  return cy.findByTestId("transform-list-page");
}

function getTransformPage() {
  return cy.findByTestId("transform-page");
}

function getJobListPage() {
  return cy.findByTestId("job-list-page");
}

function getJobPage() {
  return cy.findByTestId("job-view");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function getRunButton() {
  return cy.findByTestId("run-button");
}

function getRunListLink() {
  return cy.findByRole("link", { name: "See all runs" });
}

function getRunErrorInfoButton() {
  return cy.findByLabelText("See error");
}

function getTableLink() {
  return cy.findByTestId("table-link");
}

function getDatabaseLink() {
  return cy.findByTestId("database-link");
}

function getSchemaLink() {
  return cy.findByTestId("schema-link");
}

function getQueryVisualization() {
  return cy.findByTestId("query-visualization-root");
}

function getCronInput() {
  return cy.findByPlaceholderText("For example 5 0 * Aug ?");
}

function getTagsInput() {
  return cy.findByPlaceholderText("Add tags");
}

function getContentTable() {
  return cy.findByTestId("admin-content-table");
}

function getSidebar() {
  return cy.findByTestId("transform-sidebar");
}

function visitTransformListPage() {
  return cy.visit("/admin/transforms");
}

function visitJobListPage() {
  return cy.visit("/admin/transforms/jobs");
}

function runAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function runAndWaitForFailure() {
  getRunButton().click();
  getRunButton().should("have.text", "Run failed");
}

function createMbqlTransform({
  sourceTable = SOURCE_TABLE,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  tagIds,
  visitTransform,
}: {
  sourceTable?: string;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
} = {}) {
  H.getTableId({ name: sourceTable }).then((tableId) => {
    H.createTransform(
      {
        name: "MBQL transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": tableId,
            },
          },
        },
        target: {
          type: "table",
          name: targetTable,
          schema: targetSchema,
        },
        tag_ids: tagIds,
      },
      { wrapId: true, visitTransform },
    );
  });
}

function createSqlTransform({
  sourceQuery,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  visitTransform,
}: {
  sourceQuery: string;
  targetTable?: string;
  targetSchema?: string;
  visitTransform?: boolean;
}) {
  H.createTransform(
    {
      name: "SQL transform",
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query: sourceQuery,
          },
        },
      },
      target: {
        type: "table",
        name: targetTable,
        schema: targetSchema,
      },
    },
    { wrapId: true, visitTransform },
  );
}

function createTransformTags(names: string[]) {
  names.forEach((name) => H.createTransformTag({ name }));
}

function visitTableQuestion({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  H.createNativeQuestion(
    {
      database: WRITABLE_DB_ID,
      native: {
        query: `SELECT * FROM "${targetSchema}"."${targetTable}"`,
        "template-tags": {},
      },
    },
    { visitQuestion: true },
  );
}

function assertTableDoesNotExistError({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  getQueryVisualization()
    .contains(`"${targetSchema}.${targetTable}" does not exist`)
    .should("be.visible");
}

function assertOptionSelected(name: string) {
  cy.findByRole("option", { name }).should(
    "have.attr",
    "aria-selected",
    "true",
  );
}

function assertOptionNotSelected(name: string) {
  cy.findByRole("option", { name }).should(
    "not.have.attr",
    "aria-selected",
    "true",
  );
}
