import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { TransformTest } from "metabase-types/api";

const { H } = cy;

const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_SCHEMA = "Schema A";
const TEST_NAME = "Keeps high scores";

describe(
  "scenarios > data studio > transform tests",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.updateSetting("transforms-enabled", true);
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      cy.intercept("POST", "/api/ee/transform-test/*/run").as("runTest");
      createTransformWithTest();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("runs a test from the Tests tab and shows its runs", () => {
      cy.log("run the test from its row menu in the Tests tab");
      cy.get<number>("@transformId").then((transformId) =>
        cy.visit(`/data-studio/transforms/${transformId}/tests`),
      );
      H.main().findByRole("button", { name: "Test options" }).click();
      H.popover()
        .findByRole("menuitem", { name: /Run test/ })
        .click();
      cy.wait("@runTest");
      H.undoToast().should("contain.text", "Test passed");
      H.expectUnstructuredSnowplowEvent({
        event: "data_test_trigger_manual_run",
        event_detail: "transform",
        triggered_from: "test_list",
      });

      cy.log("run the test again from its runs and see both runs");
      H.main().findByText(TEST_NAME).click();
      H.main().findByRole("tab", { name: "Runs" }).click();
      H.main()
        .findAllByRole("row", { name: /Passed/ })
        .should("have.length", 1);
      H.main()
        .findByRole("button", { name: /Ran successfully|Run now/ })
        .click();
      cy.wait("@runTest");
      H.main()
        .findAllByRole("row", { name: /Passed/ })
        .should("have.length", 2);

      cy.log("the runs are stored by the backend");
      cy.reload();
      H.main()
        .findAllByRole("row", { name: /Passed/ })
        .should("have.length", 2);
    });
  },
);

function createTransformWithTest() {
  H.createSqlTransform({
    name: "High scores",
    sourceQuery: `SELECT name, score FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}" WHERE score > 15`,
    targetTable: TARGET_TABLE,
    targetSchema: TARGET_SCHEMA,
  });
  cy.get<number>("@transformId").then((transformId) =>
    cy.request<TransformTest>("POST", "/api/ee/transform-test", {
      transform_id: transformId,
      name: TEST_NAME,
      inputs: [
        {
          table: { schema: TARGET_SCHEMA, name: SOURCE_TABLE },
          format: "rows",
          columns: [
            { name: "name", cast_type: "text" },
            { name: "score", cast_type: "integer" },
          ],
          rows: [
            { name: "Cat", score: 5 },
            { name: "Dog", score: 25 },
          ],
        },
      ],
      expectations: [
        {
          type: "empty",
          name: "No low scores",
          sql: `SELECT * FROM "${TARGET_SCHEMA}"."${TARGET_TABLE}" WHERE score <= 15`,
        },
      ],
    }),
  );
}
