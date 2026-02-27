import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { JoinStrategy, SchemaName, TransformId } from "metabase-types/api";

const { H } = cy;

const SOURCE_TABLE = "Animals";
const TARGET_SCHEMA = "Schema A";
const JOIN_SCHEMA = "Schema B";

describe("scenarios > data-studio > transforms > inspect", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("GET", "/api/transform/*/inspect").as("inspectorDiscovery");
    cy.intercept("GET", "/api/transform/*/inspect/*").as("inspectorLens");

    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("pre-run state", () => {
    it("should show alert when transform has not been run, then show inspect after running", () => {
      H.createMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_prerun_table",
        targetSchema: TARGET_SCHEMA,
        name: "Pre-run inspect transform",
        visitTransform: false,
      }).then(({ body: transform }) => {
        H.DataStudio.Transforms.visitInspect(transform.id);
      });

      cy.findByRole("alert").should(
        "have.text",
        "To inspect the transform you need to run it first.",
      );

      cy.findAllByTestId("run-button").first().click();

      cy.wait("@inspectorDiscovery");

      cy.findByRole("alert").should("not.exist");
      cy.findByRole("tab", { name: /Summary/ }).should("be.visible");
      cy.findByRole("heading", { name: /1 input table/i }).should("be.visible");
      cy.findByRole("heading", { name: /1 output table/i }).should(
        "be.visible",
      );

      cy.findAllByRole("treegrid").should("have.length", 4);
      cy.findAllByRole("treegrid")
        .first()
        .findByText("Animals")
        .should("be.visible");
    });
  });

  describe("generic-summary lens", () => {
    it("should show Summary tab after running an MBQL transform", () => {
      H.createAndRunMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_mbql_table",
        targetSchema: TARGET_SCHEMA,
        name: "MBQL inspect transform",
      }).then(({ transformId }) => {
        H.DataStudio.Transforms.visitInspect(transformId);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByRole("tab", { name: /Summary/ }).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByRole("heading", { name: /1 input table/i }).should("be.visible");
      cy.findByRole("heading", { name: /1 output table/i }).should(
        "be.visible",
      );

      cy.findByTestId("generic-summary-tables").within(() => {
        cy.findAllByRole("treegrid")
          .eq(0)
          .within(() => {
            cy.findByRole("row").within(() => {
              cy.findAllByRole("gridcell").eq(0).should("have.text", "Animals");
              cy.findAllByRole("gridcell").eq(1).should("have.text", "3");
              cy.findAllByRole("gridcell").eq(2).should("have.text", "2");
            });
          });

        cy.findAllByRole("treegrid")
          .eq(1)
          .within(() => {
            cy.findByRole("row").within(() => {
              cy.findAllByRole("gridcell")
                .eq(0)
                .should("have.text", "inspect_mbql_table");
              cy.findAllByRole("gridcell").eq(1).should("have.text", "3");
              cy.findAllByRole("gridcell").eq(2).should("have.text", "2");
            });
          });
      });

      cy.findByTestId("generic-summary-fields").within(() => {
        cy.findAllByRole("treegrid")
          .eq(0)
          .within(() => {
            cy.findAllByRole("row").should("have.length", 3);
            cy.findAllByRole("row").eq(0).should("have.text", "Animals (2)");
            cy.findAllByRole("row")
              .eq(1)
              .within(() => {
                cy.findAllByRole("gridcell").eq(0).should("have.text", "Name");
                cy.findAllByRole("gridcell").eq(1).should("have.text", "Text");
                cy.findAllByRole("gridcell").eq(2).should("have.text", "3");
                cy.findAllByRole("gridcell")
                  .eq(3)
                  .should("have.text", "0.00 %");
              });
            cy.findAllByRole("row")
              .eq(2)
              .within(() => {
                cy.findAllByRole("gridcell").eq(0).should("have.text", "Score");
                cy.findAllByRole("gridcell")
                  .eq(1)
                  .should("have.text", "Integer");
                cy.findAllByRole("gridcell").eq(2).should("have.text", "3");
                cy.findAllByRole("gridcell")
                  .eq(3)
                  .should("have.text", "0.00 %");
              });
          });
      });

      H.expectUnstructuredSnowplowEvent({
        event: "transform_inspect_lens_loaded",
        event_detail: "generic-summary",
      });
    });
  });

  describe("join-analysis lens", () => {
    it("should show Join Analysis tab when transform has joins", () => {
      createAndRunMbqlJoinTransform({
        name: "Join MBQL inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_table",
      });

      cy.wait("@inspectorDiscovery");

      cy.findByRole("tab", { name: /Summary/ }).should("be.visible");
      cy.findByRole("tab", { name: /Join Analysis/ }).should("be.visible");
    });

    it("should display join step data in tree table", () => {
      createAndRunMbqlJoinTransform({
        name: "Join tree inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_tree_table",
      });

      const tabName = /Join Analysis/;

      cy.wait("@inspectorDiscovery");
      cy.wait("@inspectorLens");

      cy.findByRole("tab", { name: tabName }).within(() => {
        cy.findByLabelText(/clock icon/i).should("be.visible");
      });
      cy.findByRole("tab", { name: tabName }).click();

      cy.wait("@inspectorLens");

      cy.findByRole("tab", { name: tabName }).within(() => {
        cy.findByLabelText(/clock icon/i).should("not.exist");
      });

      cy.findByRole("treegrid").within(() => {
        cy.findByText("Join").should("be.visible");
        cy.findByText("Output").should("be.visible");
        cy.findByText("Matched").should("be.visible");
        cy.findByText("Table rows").should("be.visible");
      });

      cy.findByRole("heading", { name: /1 join/i }).should("be.visible");
    });

    it("should show unmatched rows alert for left join with non-matching rows", () => {
      H.resetTestTable({ type: "postgres", table: "no_pk_table" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "no_pk_table" });

      createAndRunMbqlJoinTransform({
        name: "Left join unmatched transform",
        targetTable: "inspect_unmatched_table",
        sourceTable: "no_pk_table",
        sourceSchema: undefined,
        joinTable: SOURCE_TABLE,
        joinSchema: TARGET_SCHEMA,
        joinStrategy: "left-join",
      });

      cy.wait("@inspectorDiscovery");
      cy.wait("@inspectorLens");

      cy.findByRole("tab", { name: /Join Analysis/ }).click();

      cy.wait("@inspectorLens");

      // Wait for trigger evaluation — drill button appears once card stats are loaded
      cy.findByRole("button", {
        name: /Unmatched rows in Animals - Name/i,
      }).should("be.visible");

      // Expand the alert by clicking the warning icon in the first cell
      cy.findByRole("treegrid").within(() => {
        cy.findAllByRole("gridcell").first().findByRole("button").click();
        cy.findByText(/Join 'Animals - Name' has >20% unmatched rows/).should(
          "be.visible",
        );
      });

      H.expectUnstructuredSnowplowEvent({
        event: "transform_inspect_alert_clicked",
      });
    });
  });

  describe("drill-down lenses", () => {
    it("loads unmatched-rows drill-down lens when triggered", () => {
      H.resetTestTable({ type: "postgres", table: "no_pk_table" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "no_pk_table" });
      createAndRunMbqlJoinTransform({
        name: "Left join unmatched transform",
        targetTable: "inspect_unmatched_table",
        sourceTable: "no_pk_table",
        sourceSchema: undefined,
        joinTable: SOURCE_TABLE,
        joinSchema: TARGET_SCHEMA,
        joinStrategy: "left-join",
      });

      cy.findByRole("tab", { name: /Join Analysis/ }).click();

      cy.findByRole("button", {
        name: /Unmatched rows in Animals - Name/,
      }).click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_inspect_drill_lens_clicked",
        triggered_from: "join_analysis",
      });

      const tabName = /Unmatched Rows/;

      cy.wait("@inspectorLens");
      cy.findByRole("tab", { name: tabName }).click();

      cy.findByRole("heading", { name: /Unmatched Row Samples/ }).should(
        "be.visible",
      );
      cy.findByRole("link", {
        name: /Animals - Name: Rows with key but no match/,
      }).should("be.visible");

      cy.findAllByTestId("visualization-root")
        .eq(0)
        .within(() => {
          cy.findByTestId("table-footer").should("have.text", "3 rows");
        });

      H.expectUnstructuredSnowplowEvent({
        event: "transform_inspect_lens_loaded",
        event_detail: "unmatched-rows?join_step=1",
      });

      cy.findByRole("tab", { name: tabName }).within(() => {
        cy.findByRole("button", { name: /Close tab/i }).click();
      });

      cy.findByRole("link", {
        name: tabName,
      }).should("not.exist");

      H.expectUnstructuredSnowplowEvent({
        event: "transform_inspect_drill_lens_closed",
      });
    });
  });

  describe("column-comparison lens", () => {
    it("should show Column Distributions lens", () => {
      H.createAndRunMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_coldist_table",
        targetSchema: TARGET_SCHEMA,
        name: "ColDist inspect transform",
      }).then(({ transformId }) => {
        H.DataStudio.Transforms.visitInspect(transformId);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByRole("tab", { name: /Column Distributions/ }).click();

      cy.findByRole("heading", { name: /2 matched columns/i }).should(
        "be.visible",
      );

      cy.findAllByTestId("visualization-root")
        .should("have.length", 4)
        .each((visualization) => {
          cy.wrap(visualization).within(() => {
            cy.findByRole("link").should("exist");
          });
        });
    });
  });

  describe("sql transforms", () => {
    it("should show Summary tab for a SQL transform", () => {
      H.createAndRunSqlTransform({
        name: "SQL inspect transform",
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: "inspect_sql_table",
        targetSchema: TARGET_SCHEMA,
      }).then(({ transformId }) => {
        H.DataStudio.Transforms.visitInspect(transformId);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByRole("tab", { name: /Summary/ }).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByRole("heading", { name: /1 input table/i }).should("be.visible");
      cy.findByRole("heading", { name: /1 output table/i }).should(
        "be.visible",
      );
    });
  });
});

// This transform with 50% unmatched rows triggers >20% alert and drill lens
function createAndRunMbqlJoinTransform({
  name,
  targetTable,
  sourceTable = SOURCE_TABLE,
  sourceSchema,
  joinTable = SOURCE_TABLE,
  joinSchema = JOIN_SCHEMA,
  joinStrategy = "inner-join",
}: {
  name: string;
  targetTable: string;
  sourceTable?: string;
  sourceSchema: SchemaName | undefined;
  joinTable?: string;
  joinSchema?: SchemaName;
  joinStrategy?: JoinStrategy;
}): Cypress.Chainable<{ transformId: TransformId }> {
  return H.cypressWaitAll([
    H.getTableId({ name: sourceTable, schema: sourceSchema }),
    H.getTableId({ name: joinTable, schema: joinSchema }),
  ]).then(([sourceTableId, joinTableId]) => {
    return H.createTestQuery({
      database: WRITABLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: sourceTableId },
          joins: [
            {
              source: { type: "table", id: joinTableId },
              strategy: joinStrategy,
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "name" },
                  right: { type: "column", name: "name" },
                },
              ],
            },
          ],
        },
      ],
    }).then((query) => {
      return H.createTransform({
        name,
        source: { type: "query", query },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: targetTable,
          schema: TARGET_SCHEMA,
        },
      })
        .then(({ body: transform }) => {
          cy.request("POST", `/api/transform/${transform.id}/run`);
          H.waitForSucceededTransformRuns();
          return cy.wrap({ transformId: transform.id });
        })
        .then(({ transformId }) => {
          H.DataStudio.Transforms.visitInspect(transformId);
        });
    });
  });
}
