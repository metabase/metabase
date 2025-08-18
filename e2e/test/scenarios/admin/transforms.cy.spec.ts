const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  CardType,
  ListTransformRunsResponse,
  TransformTagId,
} from "metabase-types/api";

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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();
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
        runTransformAndWaitForSuccess();
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
      createMbqlTransform({ visitTransform: true });
      getTagsInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: "hourly" }).click();
        cy.wait("@updateTransform");
        assertOptionSelected("hourly");
        assertOptionNotSelected("daily");

        cy.findByRole("option", { name: "daily" }).click();
        cy.wait("@updateTransform");
        assertOptionSelected("hourly");
        assertOptionSelected("daily");

        cy.findByRole("option", { name: "hourly" }).click();
        cy.wait("@updateTransform");
        assertOptionNotSelected("hourly");
        assertOptionSelected("daily");
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
      createMbqlTransform({ visitTransform: true });

      getTagsInput().click();
      H.popover()
        .findByRole("option", { name: "hourly" })
        .findByLabelText("Rename tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("daily_changed");
        cy.button("Save").click();
        cy.wait("@updateTag");
      });

      getTagsInput().click();
      H.popover().findByText("daily_changed").should("be.visible");
    });

    it("should be able to delete tags inline", () => {
      createMbqlTransform({ visitTransform: true });

      getTagsInput().click();
      H.popover()
        .findByRole("option", { name: "hourly" })
        .findByLabelText("Delete tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.button("Delete tag").click();
        cy.wait("@deleteTag");
      });
      H.undoToast().should("contain.text", "Transform tags updated");

      getTagsInput().click();
      H.popover().within(() => {
        cy.findByText("daily").should("be.visible");
        cy.findByText("hourly").should("not.exist");
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
      runTransformAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(TARGET_SCHEMA_2).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and keep the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

      cy.log("create and run another transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
        visitTransform: true,
      });
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForFailure();
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
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();

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
      H.popover().findByText("daily").click();
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
        cy.findByText("daily").should("be.visible");
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
    it("should be able to run a job on a schedule", () => {
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        createMbqlTransform({
          tagIds: [tag.id],
        });
        H.createTransformJob({
          name: "New job",
          schedule: "* * * * * ? *", // every second
          tag_ids: [tag.id],
        });
      });
      waitForRuns();
      visitRunListPage();
      getContentTable().within(() => {
        cy.findAllByText("MBQL transform").should("have.length.gte", 1);
        cy.findAllByText("Success").should("have.length.gte", 1);
        cy.findAllByText("Schedule").should("have.length.gte", 1);
      });
    });

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
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      getTagsInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: "hourly" }).click();
        cy.wait("@updateJob");
        assertOptionSelected("hourly");
        assertOptionNotSelected("daily");

        cy.findByRole("option", { name: "daily" }).click();
        cy.wait("@updateJob");
        assertOptionSelected("hourly");
        assertOptionSelected("daily");

        cy.findByRole("option", { name: "hourly" }).click();
        cy.wait("@updateJob");
        assertOptionNotSelected("hourly");
        assertOptionSelected("daily");
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
      runJobAndWaitForSuccess();
      getNavSidebar().findByText("Runs").click();
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

  describe("default jobs and tags", () => {
    it("should pre-create default jobs and tags", () => {
      const jobNames = ["Hourly job", "Daily job", "Weekly job", "Monthly job"];
      const tagNames = ["hourly", "daily", "weekly", "monthly"];

      cy.log("make sure that default jobs are created");
      visitJobListPage();
      getContentTable().within(() => {
        jobNames.forEach((jobName) =>
          cy.findByText(jobName).should("be.visible"),
        );
        tagNames.forEach((tagName) =>
          cy.findByText(tagName).should("be.visible"),
        );
      });

      cy.log("make sure that default tags are available for selection");
      getJobListPage().findByRole("link", { name: "Create a job" }).click();
      getTagsInput().click();
      H.popover().within(() => {
        tagNames.forEach((tagName) =>
          cy.findByText(tagName).should("be.visible"),
        );
      });
    });
  });
});

describe("scenarios > admin > transforms > runs", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to filter runs", () => {
    function createInitialData() {
      H.createTransformTag({ name: "tag1" }).then(({ body: tag1 }) => {
        H.createTransformTag({ name: "tag2" }).then(({ body: tag2 }) => {
          createMbqlTransform({
            targetTable: TARGET_TABLE,
            tagIds: [tag1.id],
            visitTransform: true,
          });
          runTransformAndWaitForSuccess();
          createSqlTransform({
            sourceQuery: "SELECT * FROM abc",
            targetTable: TARGET_TABLE_2,
            tagIds: [tag2.id],
            visitTransform: true,
          });
          runTransformAndWaitForFailure();
        });
      });
    }

    function testTransformFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - add a filter");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.button("Add filter").click();
      });
      getTransformFilterWidget()
        .findByText("MBQL transform")
        .should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("transform filter - update a filter");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.findByText("SQL transform").click();
        cy.button("Update filter").click();
      });
      getTransformFilterWidget()
        .findByText("SQL transform")
        .should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - multiple options");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.button("Update filter").click();
      });
      getTransformFilterWidget()
        .findByText("2 transforms")
        .should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getTransformFilterWidget().button("Remove filter").click();
      getTransformFilterWidget().findByText("2 transforms").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testStatusFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("status filter - add a filter");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.button("Add filter").click();
      });
      getStatusFilterWidget().findByText("Success").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("status filter - update a filter");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.findByText("Failed").click();
        cy.button("Update filter").click();
      });
      getStatusFilterWidget().findByText("Failed").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("status filter - multiple options");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.button("Update filter").click();
      });
      getStatusFilterWidget().findByText("2 statuses").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getStatusFilterWidget().button("Remove filter").click();
      getStatusFilterWidget().findByText("2 statuses").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testTagFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - add a filter");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.button("Add filter").click();
      });
      getTagFilterWidget().findByText("tag1").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("tag filter - update a filter");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.findByText("tag2").click();
        cy.button("Update filter").click();
      });
      getTagFilterWidget().findByText("tag2").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - multiple options");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.button("Update filter").click();
      });
      getTagFilterWidget().findByText("2 tags").should("be.visible");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - remove filter");
      getTagFilterWidget().button("Remove filter").click();
      getTagFilterWidget().findByText("2 tags").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    createInitialData();
    getNavSidebar().findByText("Runs").click();
    testTransformFilter();
    testStatusFilter();
    testTagFilter();
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

function getNavSidebar() {
  return cy.findByTestId("transform-sidebar");
}

function getTransformFilterWidget() {
  return cy.findByRole("group", { name: "Transform" });
}

function getStatusFilterWidget() {
  return cy.findByRole("group", { name: "Status" });
}

function getTagFilterWidget() {
  return cy.findByRole("group", { name: "Tags" });
}

function visitTransformListPage() {
  return cy.visit("/admin/transforms");
}

function visitJobListPage() {
  return cy.visit("/admin/transforms/jobs");
}

function visitRunListPage() {
  return cy.visit("/admin/transforms/runs");
}

function runTransformAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
  getTableLink().should("have.attr", "href");
}

function runTransformAndWaitForFailure() {
  getRunButton().click();
  getRunButton().should("have.text", "Run failed");
}

function runJobAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
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
      { visitTransform },
    );
  });
}

function createSqlTransform({
  sourceQuery,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  tagIds,
  visitTransform,
}: {
  sourceQuery: string;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
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
      tag_ids: tagIds,
    },
    { wrapId: true, visitTransform },
  );
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

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

function waitForRuns(timeout = WAIT_TIMEOUT): Cypress.Chainable {
  return cy
    .request<ListTransformRunsResponse>("GET", "/api/ee/transform/run")
    .then((response) => {
      if (response.body.data.length > 0) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForRuns(timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Run retry timeout");
      }
    });
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
