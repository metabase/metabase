import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe(
  "scenarios > data studio > data actions",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      cy.intercept("POST", "/api/action").as("createAction");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
      cy.intercept("POST", "/api/action/*/execute").as("executeAction");
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("query actions", () => {
      const SCHEMA = "Schema A";
      const TABLE = "Animals";
      const ACTION_NAME = "Rename animal";
      const ACTION_QUERY = `UPDATE "${SCHEMA}"."${TABLE}" SET name = {{new_name}} WHERE name = {{name}}`;

      beforeEach(() => {
        H.resetTestTable({ type: "postgres", table: "many_schemas" });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE });
      });

      it("creates, edits, runs, and archives a data action", () => {
        cy.log("create an action");
        H.DataStudio.Actions.visitList();
        cy.findByRole("button", { name: /New/ }).click();
        H.popover()
          .findByRole("menuitem", { name: /SQL query/ })
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
        H.expectUnstructuredSnowplowEvent({
          event: "data_action_query_updated",
        });

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
        H.expectUnstructuredSnowplowEvent({
          event: "data_action_executed",
          triggered_from: "data_studio",
        });

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
    });

    describe("implicit actions", () => {
      const TABLE = "scoreboard_actions";
      const TABLE_DISPLAY_NAME = "Scoreboard Actions";
      const ACTION_NAME = `Insert ${TABLE_DISPLAY_NAME}`;

      beforeEach(() => {
        H.resetTestTable({ type: "postgres", table: TABLE });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE });
      });

      it("creates an action from a table, edits it, and runs it", () => {
        cy.log("create an insert action from a table");
        H.DataStudio.Actions.visitList();
        cy.findByRole("button", { name: /New/ }).click();
        H.popover().findByRole("menuitem", { name: /Table/ }).click();
        H.entityPickerModal().within(() => {
          H.entityPickerModalItem(0, "Databases").click();
          H.entityPickerModalItem(1, /Writable Postgres/).click();
          H.entityPickerModalItem(2, TABLE_DISPLAY_NAME).click();
          cy.findByRole("button", { name: "Continue" }).click();
        });
        cy.findByTestId("implicit-action-definition").within(() => {
          cy.findByText(TABLE_DISPLAY_NAME).should("be.visible");
          cy.findByRole("radio", { name: "Insert" }).should("be.checked");
        });
        cy.findByRole("button", { name: "Save" }).click();
        H.modal().within(() => {
          cy.findByLabelText("Name").should("have.value", ACTION_NAME);
          cy.findByRole("button", { name: "Save" }).click();
        });
        cy.wait("@createAction");
        H.expectUnstructuredSnowplowEvent({ event: "data_action_created" });

        cy.log("change its operation, then undo the change");
        cy.findByTestId("action-definition")
          .findByRole("radio", { name: "Update" })
          .should("be.enabled")
          .click({ force: true });
        cy.wait("@updateAction")
          .its("request.body")
          .should("deep.include", { kind: "row/update" });
        cy.findByTestId("action-definition")
          .findByRole("radio", { name: "Update" })
          .should("be.checked");
        H.undoToast()
          .should("contain.text", "Action operation updated")
          .findByRole("button", { name: "Undo" })
          .click();
        cy.wait("@updateAction")
          .its("request.body")
          .should("deep.include", { kind: "row/create" });
        H.undoToast().should("contain.text", "Change undone");
        cy.findByTestId("action-definition")
          .findByRole("radio", { name: "Insert" })
          .should("be.checked");

        cy.log("hide a field");
        cy.findByRole("link", { name: "Fields" }).click();
        cy.findByTestId("action-fields")
          .findByRole("listitem", { name: "Status" })
          .click();
        cy.findByTestId("action-field-details")
          .findByRole("switch", { name: /Show field/ })
          .should("be.checked")
          .and("be.enabled")
          .click({ force: true });
        cy.wait("@updateAction")
          .its("response.body.visualization_settings.fields.status.hidden")
          .should("eq", true);
        cy.findByTestId("action-field-details")
          .findByRole("switch", { name: /Show field/ })
          .should("not.be.checked");

        cy.log("run it");
        cy.findByRole("link", { name: "Run" }).click();
        cy.findByRole("button", { name: /Run/ }).click();
        H.modal().within(() => {
          cy.findByLabelText(/Team Name/).type("Ornery Otters");
          cy.findByLabelText(/Score/).type("5");
          cy.findByLabelText(/Status/).should("not.exist");
          cy.findByRole("button", { name: "Save" }).click();
        });
        cy.wait("@executeAction");
        H.modal().should("not.exist");
        H.queryWritableDB(
          `SELECT score, status FROM ${TABLE} WHERE team_name = 'Ornery Otters'`,
        ).then(({ rows }) => {
          expect(rows).to.deep.equal([{ score: 5, status: "active" }]);
        });
      });
    });
  },
);
