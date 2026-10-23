import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const SCHEMA = "Schema A";
const TABLE = "Animals";
const ACTION_NAME = "Rename animal";
const ACTION_QUERY = `UPDATE "${SCHEMA}"."${TABLE}" SET name = {{new_name}} WHERE name = {{name}}`;

describe(
  "scenarios > data studio > data actions",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      cy.intercept("POST", "/api/action").as("createAction");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
      cy.intercept("POST", "/api/action/*/execute").as("executeAction");
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("creates, edits, runs, and archives a data action", () => {
      cy.log("create an action");
      H.DataStudio.Actions.visitList();
      cy.findByRole("button", { name: /New/ }).click();
      H.popover()
        .findByRole("menuitem", { name: /Action/ })
        .click();
      H.NativeEditor.type(ACTION_QUERY);
      cy.findByRole("button", { name: "Save" }).click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type(ACTION_NAME);
        cy.findByRole("button", { name: "Save" }).click();
      });
      cy.wait("@createAction");
      cy.findByTestId("action-definition").should("be.visible");
      H.expectUnstructuredSnowplowEvent({ event: "data_action_created" });

      cy.log("edit its query");
      cy.findByRole("link", { name: /Edit definition/ }).click();
      H.NativeEditor.type(" AND score > 0");
      cy.findByRole("button", { name: "Save" }).click();
      cy.wait("@updateAction");
      H.undoToast().should("contain.text", "Action updated");
      H.expectUnstructuredSnowplowEvent({ event: "data_action_query_updated" });

      cy.log("run it");
      cy.findByRole("link", { name: "Run" }).click();
      cy.findByRole("button", { name: /Run/ }).click();
      H.modal().within(() => {
        cy.findByLabelText("New Name").type("Goose");
        cy.findByLabelText("Name").type("Duck");
        cy.findByRole("button", { name: ACTION_NAME }).click();
      });
      cy.wait("@executeAction");
      H.modal().should("not.exist");
      H.expectUnstructuredSnowplowEvent({ event: "data_action_executed" });

      cy.log("archive it");
      cy.findByRole("button", { name: "Action options" }).click();
      H.popover()
        .findByRole("menuitem", { name: /Archive/ })
        .click();
      H.modal().findByRole("button", { name: "Archive" }).click();
      cy.wait("@updateAction");
      H.undoToastListContainer()
        .findByText("Action archived")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText(ACTION_NAME)
        .should("not.exist");
      H.expectUnstructuredSnowplowEvent({ event: "data_action_archived" });
    });
  },
);
