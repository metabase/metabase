import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  getTable,
  openNotebook,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

const DIALECT = "postgres";
const TABLE = "uuid_pk_table";

describe("issue 40176", () => {
  beforeEach(() => {
    restore(`${DIALECT}-writable`);
    cy.signInAsAdmin();
    resetTestTable({ type: DIALECT, table: TABLE });
    resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE,
    });
  });

  it(
    "should allow filtering on UUID PK columns (metabase#40176)",
    { tags: "@external" },
    () => {
      getTable({ name: TABLE }).then(({ id: tableId }) => {
        visitQuestionAdhoc({
          display: "table",
          dataset_query: {
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
            },
            type: "query",
          },
        });
      });
      openNotebook();
      cy.findByTestId("action-buttons").findByText("Filter").click();
      popover().within(() => {
        cy.findByText("ID").click();
        cy.findByLabelText("Filter value").type(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        cy.button("Add filter").click();
      });
      visualize();
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");
    },
  );
});
