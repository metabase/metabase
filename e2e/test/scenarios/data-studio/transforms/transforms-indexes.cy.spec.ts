import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { StructuredIndex, TransformId } from "metabase-types/api";

const { H } = cy;

const SOURCE_TABLE = "Animals";
const TARGET_SCHEMA = "Schema A";

const INDEX_TABLE_COLUMNS = [
  "Name",
  "Type",
  "Columns",
  "Source",
  "Status",
  "Last modified by",
  "Last run",
];

describe("data-studio > transforms > indexes", { tags: ["@external"] }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });
  });

  it("lists managed index requests with pending and removing statuses and sorts by column", () => {
    H.createMbqlTransform({
      sourceTable: SOURCE_TABLE,
      targetTable: "indexes_list_table",
      targetSchema: TARGET_SCHEMA,
      name: "Indexes list transform",
    }).then(({ body: transform }) => {
      createIndexRequest(transform.id, btreeIndex("idx_animal_name", ["name"]));
      createIndexRequest(
        transform.id,
        btreeIndex("idx_animal_score", ["score", "name"]),
      ).then(({ body: request }) => {
        cy.request("DELETE", `/api/index/request/${request.id}`);
      });
      H.DataStudio.Transforms.visitIndexes(transform.id);
    });

    cy.log("all column headers render");
    indexesTable().within(() => {
      INDEX_TABLE_COLUMNS.forEach((header) => {
        cy.findByRole("columnheader", { name: matchHeaderName(header) }).should(
          "be.visible",
        );
      });
    });

    cy.log("pending request row shows all cell values");
    indexesTable().findAllByRole("row").should("have.length", 2);
    indexesTable()
      .findAllByRole("row")
      .eq(0)
      .should("contain", "idx_animal_name")
      .and("contain", "B-Tree")
      .and("contain", "name")
      .and("contain", "Managed")
      .and("contain", "Pending")
      .and("contain", "Bobby Tables")
      .and("contain", "Never");

    cy.log("deleted request row shows the Removing status");
    indexesTable()
      .findAllByRole("row")
      .eq(1)
      .should("contain", "idx_animal_score")
      .and("contain", "score, name")
      .and("contain", "Removing");

    cy.log("clicking the Name header toggles the sort direction");
    indexesTable()
      .findByRole("columnheader", { name: matchHeaderName("Name") })
      .click();
    indexesTable()
      .findByRole("columnheader", { name: matchHeaderName("Name") })
      .should("have.attr", "aria-sort", "descending");
    indexesTable()
      .findAllByRole("row")
      .should("have.length", 2)
      .eq(0)
      .should("contain", "idx_animal_score");
  });

  it("shows a pending index becoming succeeded after a transform run and lists unmanaged warehouse indexes", () => {
    const targetTable = "indexes_lifecycle_table";

    cy.log("run the transform once so the target table exists");
    H.createMbqlTransform({
      sourceTable: SOURCE_TABLE,
      targetTable,
      targetSchema: TARGET_SCHEMA,
      name: "Indexes lifecycle transform",
    }).then(({ body: transform }) => {
      H.runTransformAndWaitForSuccess(transform.id);
      H.DataStudio.Transforms.visitIndexes(transform.id);
    });

    cy.log("the empty state renders for a transform with no indexes");
    cy.findByTestId("transforms-indexes-content")
      .should("contain", "Indexes")
      .and(
        "contain",
        "Index the key columns of your transforms to make them faster and more efficient.",
      );

    cy.log("create an index via the form");
    cy.findByTestId("transforms-indexes-content")
      .findByRole("button", { name: "Create index" })
      .click();

    cy.log("form fields render in the backend-defined order, name first");
    H.modal()
      .find("label")
      .should((labels) => {
        const labelTexts = labels.toArray().map((label) => label.textContent);
        expect(labelTexts).to.deep.equal([
          "Give your index a name",
          "Index type",
          "Enforce uniqueness across rows for indexed columns.",
          "Columns",
        ]);
      });

    H.modal().within(() => {
      cy.findByLabelText("Give your index a name").type("idx_lifecycle_name");
      cy.findByPlaceholderText("Select columns").click();
    });
    cy.findByRole("option", { name: "Name" }).click();
    H.modal().within(() => {
      cy.findByRole("button", { name: "Create index" }).click();
    });
    H.undoToast().findByText("Index created").should("be.visible");

    cy.log("the new index request starts out pending and never run");
    indexesTable()
      .findAllByRole("row")
      .should("have.length", 1)
      .eq(0)
      .should("contain", "idx_lifecycle_name")
      .and("contain", "Managed")
      .and("contain", "Pending")
      .and("contain", "Never");

    cy.log("run the transform from the run tab");
    H.DataStudio.Transforms.runTab().click();
    H.DataStudio.Transforms.runButton().click();
    H.DataStudio.Transforms.runButton().should("have.text", "Ran successfully");

    cy.log("simulate a DBA-created index directly in the warehouse");
    H.queryWritableDB(
      `CREATE INDEX dba_made ON "${TARGET_SCHEMA}"."${targetTable}" (score)`,
    );

    cy.log("the applied index request shows Succeeded and a last run date");
    H.DataStudio.Transforms.indexesTab().click();
    indexesTable().findAllByRole("row").should("have.length", 2);
    indexesTable()
      .findAllByRole("row")
      .eq(1)
      .should("contain", "idx_lifecycle_name")
      .and("contain", "Managed")
      .and("contain", "Succeeded")
      .and("not.contain", "Never");

    cy.log("the managed index physically exists in the warehouse");
    H.queryWritableDB(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = '${TARGET_SCHEMA}'
         AND tablename = '${targetTable}'
         AND indexname = 'idx_lifecycle_name'`,
    ).then(({ rows }) => {
      expect(rows).to.have.length(1);
    });

    cy.log("the DBA-created index is listed as unmanaged with no status");
    indexesTable()
      .findAllByRole("row")
      .eq(0)
      .should("contain", "dba_made")
      .and("contain", "score")
      .and("contain", "Unmanaged")
      .and("contain", "—");
  });
});

function btreeIndex(name: string, columns: string[]) {
  return {
    kind: "btree",
    name,
    columns: columns.map((column) => ({ name: column })),
  };
}

function createIndexRequest(
  transformId: TransformId,
  structured: StructuredIndex,
) {
  return cy.request("POST", "/api/index/request", {
    transform_id: transformId,
    structured,
  });
}

function indexesTable() {
  return cy.findByRole("treegrid", { name: "Transform indexes" });
}

function matchHeaderName(label: string) {
  return new RegExp(`^${label}`);
}
