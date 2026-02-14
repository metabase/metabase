import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { JoinStrategy, TransformId } from "metabase-types/api";

const { H } = cy;

const SOURCE_TABLE = "Animals";
const TARGET_SCHEMA = "Schema A";
const JOIN_SCHEMA = "Schema B";

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
  sourceSchema: string | undefined;
  joinTable?: string;
  joinSchema?: string;
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
          return cy.wrap({ transformId: transform.id as TransformId });
        })
        .then(({ transformId }) => {
          cy.visit(`/data-studio/transforms/${transformId}/inspect`);
        });
    });
  });
}

describe("scenarios > data-studio > transforms > inspect", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("GET", "/api/transform/*/inspect").as("inspectorDiscovery");
    cy.intercept("GET", "/api/transform/*/inspect/*").as("inspectorLens");
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
        cy.visit(`/data-studio/transforms/${transform.id}/inspect`);
      });

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByText(
          "To inspect the transform you need to run it first.",
        ).should("be.visible");

        cy.findAllByTestId("run-button").first().click();
      });

      cy.wait("@inspectorDiscovery");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByText(
          "To inspect the transform you need to run it first.",
        ).should("not.exist");
        cy.findByRole("tab", { name: /Summary/ }).should("be.visible");
        cy.findByText("1 input table").should("be.visible");
        cy.findByText("1 output table").should("be.visible");

        // Verify table names appear in the treegrids
        cy.findAllByRole("treegrid").should("have.length", 2);
        cy.findAllByRole("treegrid")
          .first()
          .findByText("Animals")
          .should("be.visible");
      });
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
        cy.visit(`/data-studio/transforms/${transformId}/inspect`);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Summary/ }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        cy.findByText("1 input table").should("be.visible");
        cy.findByText("1 output table").should("be.visible");

        cy.findByTestId("generic-summary-tables").within(() => {
          cy.findAllByRole("treegrid")
            .eq(0)
            .within(() => {
              cy.findByRole("row").within(() => {
                cy.findAllByRole("gridcell")
                  .eq(0)
                  .should("have.text", "Animals");
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
                  cy.findAllByRole("gridcell")
                    .eq(0)
                    .should("have.text", "Name");
                  cy.findAllByRole("gridcell")
                    .eq(1)
                    .should("have.text", "Text");
                  cy.findAllByRole("gridcell").eq(2).should("have.text", "3");
                  cy.findAllByRole("gridcell")
                    .eq(3)
                    .should("have.text", "0.00 %");
                });
              cy.findAllByRole("row")
                .eq(2)
                .within(() => {
                  cy.findAllByRole("gridcell")
                    .eq(0)
                    .should("have.text", "Score");
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
      });
    });

    it("should show Summary tab for a SQL transform", () => {
      H.createAndRunSqlTransform({
        name: "SQL inspect transform",
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: "inspect_sql_table",
        targetSchema: TARGET_SCHEMA,
      });

      cy.wait("@inspectorDiscovery");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Summary/ }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        // FIX: this is not correct, we should have 1 input table
        cy.findByText("0 input tables").should("be.visible");
        cy.findByText("1 output table").should("be.visible");
      });
    });
  });

  describe("join-analysis lens", () => {
    it("should show Join Analysis tab when transform has joins", () => {
      createAndRunMbqlJoinTransform({
        name: "Join MBQL inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_table",
      }).then(({ transformId }) => {
        cy.visit(`/data-studio/transforms/${transformId}/inspect`);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Summary/ }).should("be.visible");
        cy.findByRole("tab", { name: /Join Analysis/ }).should("be.visible");
      });
    });

    it.only("should display join step data in tree table", () => {
      createAndRunMbqlJoinTransform({
        name: "Join tree inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_tree_table",
      });

      cy.wait("@inspectorDiscovery");
      // Wait for initial lens load (generic-summary) before switching tabs
      cy.wait("@inspectorLens");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Join Analysis/ }).click();
      });

      // Wait for join-analysis lens to load
      cy.wait("@inspectorLens");

      cy.findByTestId("transform-inspect-content").within(() => {
        // Verify join analysis treegrid has the expected column headers
        cy.findByRole("treegrid").within(() => {
          cy.findByText("Join").should("be.visible");
          cy.findByText("Output").should("be.visible");
          cy.findByText("Matched").should("be.visible");
          cy.findByText("Table rows").should("be.visible");
        });

        // Verify join count header
        cy.findByText(/1 join/).should("be.visible");
      });
    });

    it.only("should show unmatched rows alert for left join with non-matching rows", () => {
      // no_pk_table has 6 rows (Duck, Horse, Cow, Pig, Chicken, Rabbit)
      // LEFT JOIN to Animals in Schema A (3 rows: Duck, Horse, Cow) on name
      // Pig, Chicken, Rabbit won't match → 50% unmatched → triggers >20% alert
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

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Join Analysis/ }).click();
      });

      cy.wait("@inspectorLens");

      cy.findByTestId("transform-inspect-content").within(() => {
        // Wait for trigger evaluation — drill button appears once card stats are loaded
        cy.findByText(/Unmatched rows in Animals - Name/).should("be.visible");

        // Expand the alert by clicking the warning icon in the first cell
        cy.findByRole("treegrid").within(() => {
          cy.findAllByRole("gridcell").first().findByRole("button").click();
          cy.findByText(/Join 'Animals - Name' has >20% unmatched rows/).should(
            "be.visible",
          );
        });
      });
    });
  });

  describe("column-comparison lens", () => {
    it("should show Column Distributions tab when columns match", () => {
      H.createAndRunMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_coldist_table",
        targetSchema: TARGET_SCHEMA,
        name: "ColDist inspect transform",
      }).then(({ transformId }) => {
        cy.visit(`/data-studio/transforms/${transformId}/inspect`);
      });

      cy.wait("@inspectorDiscovery");

      cy.findByTestId("transform-inspect-content").within(() => {
        cy.findByRole("tab", { name: /Column Distributions/ }).should(
          "be.visible",
        );
      });
    });
  });
});
