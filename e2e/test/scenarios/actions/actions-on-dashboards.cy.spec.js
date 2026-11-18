const { H } = cy;
import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { many_data_types_rows } from "e2e/support/test_tables_data";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../native/helpers/e2e-field-filter-helpers";

const TEST_TABLE = "scoreboard_actions";
const TEST_COLUMNS_TABLE = "many_data_types";
const MODEL_NAME = "Test Action Model";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

["mysql", "postgres"].forEach((dialect) => {
  describe(
    `Write Actions on Dashboards (${dialect})`,
    { tags: ["@external", "@actions"] },
    () => {
      beforeEach(() => {
        cy.intercept("GET", /\/api\/card\/\d+/).as("getModel");
        cy.intercept("GET", "/api/action").as("getActions");
        cy.intercept("PUT", "/api/action/*").as("updateAction");
        cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute/values").as(
          "prefetchValues",
        );

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
          "executeAction",
        );
      });

      describe("adding and executing actions", () => {
        beforeEach(() => {
          H.resetSnowplow();
          H.restore(`${dialect}-writable`);
          H.resetTestTable({ type: dialect, table: TEST_TABLE });
          cy.signInAsAdmin();
          H.enableTracking();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
          H.createModelFromTableName({
            tableName: TEST_TABLE,
            modelName: MODEL_NAME,
          });
        });

        afterEach(() => {
          H.expectNoBadSnowplowEvents();
        });

        it("adds a custom query action with a hidden optional field to a dashboard and runs it", () => {
          const ACTION_NAME = "Update Score";

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].score).to.equal(0);
          });

          cy.get("@modelId").then((id) => {
            cy.visit(`/model/${id}/detail`);
            cy.wait(["@getModel", "@getModelActions"]);
          });

          const newActionBtn = () =>
            cy.findByTestId("model-actions-header").findByText("New action");

          cy.log("action creation modal closes on click outside (WRK-67)");
          newActionBtn().click();
          cy.findByTestId("action-creator").should("be.visible");
          cy.get("body").click("topLeft");
          cy.findByTestId("action-creator").should("not.exist");

          cy.log("action creation modal closes on Escape (WRK-67)");
          newActionBtn().click();
          cy.findByTestId("action-creator").should("be.visible");
          cy.get("body").type("{esc}");
          cy.findByTestId("action-creator").should("not.exist");

          newActionBtn().click();

          cy.findByRole("dialog").within(() => {
            H.fillActionQuery(
              `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }} [[ and status = {{ current_status }}]]`,
            );
          });

          // can't have this in the .within() because it needs access to document.body
          H.moveDnDKitListElement("drag-handle", {
            startIndex: 1,
            dropIndex: 0,
          });

          cy.findByRole("dialog").within(() => {
            cy.findAllByText("Number").each((el) => {
              cy.wrap(el).click();
            });

            // hide optional field
            formFieldContainer("Current Status").within(() => {
              cy.findByText("Text").click();

              toggleFieldVisibility();
              openFieldSettings();
            });
          });

          H.popover().within(() => {
            cy.findByLabelText("Required").uncheck({ force: true });
          });

          H.modal().within(() => {
            cy.findByText("Save").click();
          });

          cy.findByPlaceholderText("My new fantastic action").type(ACTION_NAME);
          cy.findByTestId("create-action-form").button("Create").click();

          createDashboardWithActionButton({
            actionName: ACTION_NAME,
            idFilter: true,
          });

          H.expectUnstructuredSnowplowEvent({
            event: "new_action_card_created",
          });

          H.filterWidget().click();
          addWidgetStringFilter("1");

          cy.findByRole("button", { name: "Update Score" }).click();
          cy.findByRole("dialog").within(() => {
            cy.findByLabelText("New Score").should("be.visible").type("55");
            // it's hidden
            cy.findByLabelText("Current Status").should("not.exist");
            cy.button(ACTION_NAME).click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].score).to.equal(55);
          });

          cy.log("show the field and make it required from the model page");
          cy.get("@modelId").then((id) => {
            cy.visit(`/model/${id}/detail`);
            cy.wait(["@getModel", "@getModelActions"]);
          });

          cy.get("[aria-label='Update Score']").within(() => {
            cy.icon("ellipsis").click();
          });

          H.popover().within(() => {
            cy.findByText("Edit").click();
          });

          cy.findByRole("dialog").within(() => {
            formFieldContainer("Current Status").within(() => {
              toggleFieldVisibility();

              openFieldSettings();
            });
          });

          H.popover().within(() => {
            cy.findByLabelText("Required").check({ force: true });
          });

          H.modal().within(() => {
            cy.findByText("Update").click();
          });

          cy.wait("@updateAction");
          // The action editor closes after the update; wait until it is gone
          // before navigating to the dashboard.
          cy.findByTestId("action-creator").should("not.exist");

          cy.get("@dashboardId").then((id) => {
            cy.visit(`/dashboard/${id}?id=1`);
          });
          H.filterWidget().should("contain.text", "1");

          cy.findByRole("button", { name: "Update Score" }).click();

          cy.findByRole("dialog").within(() => {
            cy.findByLabelText("New Score").type("56");
            cy.findByLabelText("Current Status").type("active");

            cy.button(ACTION_NAME).click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].score).to.equal(56);
          });
        });

        it("adds an implicit create action with a hidden field to a dashboard and runs it", () => {
          cy.get("@modelId").then((id) => {
            H.createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Create",
            hideField: "Created At",
          });

          H.expectUnstructuredSnowplowEvent({
            event: "new_action_card_created",
          });

          cy.findByRole("button", { name: "Create" }).click();

          H.modal().within(() => {
            cy.findByPlaceholderText("Team Name").type("Zany Zebras");
            cy.findByPlaceholderText("Score").type("44");
            cy.findByPlaceholderText("Created At").should("not.exist");

            cy.button("Save").click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);

            expect(result.rows[0].score).to.equal(44);
          });
        });

        it("adds implicit update and delete actions to dashboards and runs them", () => {
          const actionName = "Update";

          cy.get("@modelId").then((id) => {
            H.createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName,
            idFilter: true,
          });

          H.expectUnstructuredSnowplowEvent({
            event: "new_action_card_created",
          });

          H.filterWidget().click();
          addWidgetStringFilter("5");

          cy.findByRole("button", { name: actionName }).click();

          cy.wait("@prefetchValues");
          // let's check that the existing values are pre-filled correctly
          H.modal().within(() => {
            cy.findByPlaceholderText("Team Name")
              .should("have.value", "Energetic Elephants")
              .clear()
              .type("Emotional Elephants");

            cy.findByPlaceholderText("Score")
              .should("have.value", "30")
              .clear()
              .type("88");

            cy.button("Update").click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Emotional Elephants'`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);

            expect(result.rows[0].score).to.equal(88);
          });

          cy.log("delete a row via an implicit delete action");
          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].id).to.equal(3);
          });

          cy.get("@modelId").then((id) => {
            H.createImplicitAction({
              kind: "delete",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Delete",
          });

          H.expectUnstructuredSnowplowEvent(
            {
              event: "new_action_card_created",
            },
            2,
          );

          cy.findByRole("button", { name: "Delete" }).click();

          H.modal().within(() => {
            cy.findByPlaceholderText("ID").type("3");
            cy.button("Delete").click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(0);
          });
        });
      });

      describe("Actions Data Types", () => {
        beforeEach(() => {
          H.restore(`${dialect}-writable`);
          H.resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
          cy.signInAsAdmin();
          H.resyncDatabase({
            dbId: WRITABLE_DB_ID,
            tableName: TEST_COLUMNS_TABLE,
          });
          H.createModelFromTableName({
            tableName: TEST_COLUMNS_TABLE,
            modelName: MODEL_NAME,
          });
        });

        it("inserts and updates various data types, including date and time fields, via implicit actions, showing enum but not JSON or binary columns", () => {
          cy.get("@modelId").then((id) => {
            H.createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Create",
          });

          cy.findByRole("button", { name: "Create" }).click();

          H.modal().within(() => {
            cy.findByPlaceholderText("UUID").should("be.visible");
            cy.findByPlaceholderText("JSON").should("not.exist");
            cy.findByPlaceholderText("JSONB").should("not.exist");
            cy.findByPlaceholderText("Binary").should("not.exist");
            cy.findByPlaceholderText("Enum").should("exist");

            cy.findByPlaceholderText("UUID").type(
              "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
            );

            cy.findByPlaceholderText("Integer").type("-20");
            cy.findByPlaceholderText("IntegerUnsigned").type("20");
            cy.findByPlaceholderText("Tinyint").type("101");
            if (dialect === "mysql") {
              cy.findByLabelText("Tinyint1").click({ force: true });
            } else {
              cy.findByPlaceholderText("Tinyint1").type("1");
            }
            cy.findByPlaceholderText("Smallint").type("32767");
            cy.findByPlaceholderText("Mediumint").type("8388607");
            cy.findByPlaceholderText("Bigint").type("922337204775");
            cy.findByPlaceholderText("Float").type("3.4");
            cy.findByPlaceholderText("Double").type("1.79769313486");
            cy.findByPlaceholderText("Decimal").type("123901.21");

            cy.findByLabelText("Boolean").click({ force: true });

            cy.findByPlaceholderText("String").type("Zany Zebras");
            cy.findByPlaceholderText("Text").type("Zany Zebras");

            cy.findByPlaceholderText("Date").type("2020-02-01");
            cy.findByPlaceholderText("Datetime").type("2020-03-01T12:00:00");
            cy.findByPlaceholderText("DatetimeTZ").type("2020-03-01T12:00:00");
            cy.findByPlaceholderText("Time").type("12:57:57");
            cy.findByPlaceholderText("Timestamp").type("2020-03-01T12:00:00");
            cy.findByPlaceholderText("TimestampTZ").type("2020-03-01T12:00:00");

            cy.button("Save").click();
          });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE string = 'Zany Zebras'`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            const row = result.rows[0];

            expect(row.uuid).to.equal("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15");

            expect(row.integer).to.equal(-20);
            expect(row.integerUnsigned).to.equal(20);
            expect(row.tinyint).to.equal(101);
            expect(row.tinyint1).to.equal(1);
            expect(row.smallint).to.equal(32767);
            expect(row.mediumint).to.equal(8388607);
            expect(row.bigint).to.equal(
              dialect === "mysql" ? 922337204775 : String(922337204775), // the pg driver makes this a string
            );
            expect(row.float).to.equal(3.4);
            expect(row.double).to.equal(1.79769313486);
            expect(row.decimal).to.equal("123901.21"); // js needs this to be a string

            expect(row.boolean).to.equal(dialect === "mysql" ? 1 : true);

            expect(row.string).to.equal("Zany Zebras");
            expect(row.text).to.equal("Zany Zebras");

            expect(row.date).to.include("2020-02-01"); // js converts this to a full date

            // timezones are problematic here
            expect(row.datetime).to.include("2020-03-01");
            expect(row.datetimeTZ).to.include("2020-03-01");
            expect(row.time).to.include("57:57");
            expect(row.timestamp).to.include("2020-03-01");
            expect(row.timestampTZ).to.include("2020-03-01");
          });

          cy.log("update row 1 via an implicit update action");
          cy.get("@modelId").then((id) => {
            H.createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Update",
            idFilter: true,
          });

          cy.findByRole("button", { name: "Update" });

          H.filterWidget().click();
          addWidgetStringFilter("1");

          cy.findByRole("button", { name: "Update" }).click();

          cy.wait("@prefetchValues");

          const oldRow = many_data_types_rows[0];
          const newTime = "2020-01-10T01:35:55";

          H.modal()
            .first()
            .within(() => {
              changeValue({
                fieldName: "UUID",
                fieldType: "text",
                oldValue: oldRow.uuid,
                newValue: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77",
              });

              changeValue({
                fieldName: "Integer",
                fieldType: "text",
                oldValue: oldRow.integer,
                newValue: 123,
              });

              changeValue({
                fieldName: "Float",
                fieldType: "text",
                oldValue: oldRow.float,
                newValue: 2.2,
              });

              cy.findByLabelText("Boolean")
                .should("be.checked")
                .click({ force: true });

              changeValue({
                fieldName: "String",
                fieldType: "text",
                oldValue: oldRow.string,
                newValue: "new string",
              });

              changeValue({
                fieldName: "Date",
                fieldType: "date",
                oldValue: oldRow.date,
                newValue: newTime.slice(0, 10),
              });

              changeValue({
                fieldName: "Datetime",
                fieldType: "datetime-local",
                oldValue: oldRow.datetime.replace(" ", "T"),
                newValue: newTime,
              });

              changeValue({
                fieldName: "Time",
                fieldType: "time",
                oldValue: oldRow.time,
                newValue: newTime.slice(-8),
              });

              changeValue({
                fieldName: "Timestamp",
                fieldType: "datetime-local",
                oldValue: oldRow.timestamp.replace(" ", "T"),
                newValue: newTime,
              });

              changeValue({
                fieldName: "DatetimeTZ",
                fieldType: "datetime-local",
                oldValue: oldRow.datetimeTZ.replace(" ", "T"),
                newValue: newTime,
              });

              changeValue({
                fieldName: "TimestampTZ",
                fieldType: "datetime-local",
                oldValue: oldRow.timestampTZ.replace(" ", "T"),
                newValue: newTime,
              });

              cy.button("Update").click();
            });

          cy.wait("@executeAction");

          H.queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);

            const row = result.rows[0];

            expect(row).to.have.property(
              "uuid",
              "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77",
            );
            expect(row).to.have.property("integer", 123);
            expect(row).to.have.property("float", 2.2);
            expect(row).to.have.property("string", "new string");
            expect(row).to.have.property(
              "boolean",
              dialect === "mysql" ? 0 : false,
            );

            // the driver adds a time to this date so we have to use .include
            expect(row.date).to.include(newTime.slice(0, 10));
            expect(row.time).to.equal(newTime.slice(-8));

            // metabase uses UTC timestamps, so compare the date only
            const newTimeAdjusted = newTime.slice(0, 10);
            expect(row.datetime).to.include(newTimeAdjusted);
            expect(row.timestamp).to.include(newTimeAdjusted);
            expect(row.datetimeTZ).to.include(newTimeAdjusted);
            expect(row.timestampTZ).to.include(newTimeAdjusted);
          });
        });
      });
    },
  );
});

describe("Issue 32974", { tags: ["@external", "@actions"] }, () => {
  const { ALL_USERS_GROUP } = USER_GROUPS;

  const ID_ACTION_PARAMETER = createMockActionParameter({
    id: "86981cc2-2589-44b5-b559-2c8bbf5bb36a",
    name: "ID",
    slug: "id",
    type: "number/=",
    target: ["variable", ["template-tag", "id"]],
  });

  const ID_DASHBOARD_PARAMETER = createMockParameter({
    name: "ID",
    slug: "id",
    id: "9da7bdd3",
    type: "id",
    sectionId: "id",
  });

  const DASHBOARD_DETAILS = {
    name: "action dashboard",
    parameters: [ID_DASHBOARD_PARAMETER],
  };

  const EXPECTED_UPDATED_VALUE = 999;

  const QUERY_ACTION = {
    name: "Query action",
    type: "query",
    parameters: [ID_ACTION_PARAMETER],
    database_id: WRITABLE_DB_ID,
    dataset_query: {
      type: "native",
      native: {
        query: `UPDATE ${TEST_TABLE} SET SCORE = ${EXPECTED_UPDATED_VALUE} WHERE ID = {{ ${ID_ACTION_PARAMETER.slug} }}`,
        "template-tags": {
          [ID_ACTION_PARAMETER.slug]: {
            id: ID_ACTION_PARAMETER.id,
            "display-name": ID_ACTION_PARAMETER.name,
            name: ID_ACTION_PARAMETER.slug,
            type: "text",
          },
        },
      },
      database: WRITABLE_DB_ID,
    },
    visualization_settings: {
      fields: {
        [ID_ACTION_PARAMETER.id]: {
          id: ID_ACTION_PARAMETER.id,
          required: true,
          fieldType: "number",
          inputType: "number",
        },
      },
    },
  };

  function setupWritableDB() {
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });

    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });

    H.createModelFromTableName({
      tableName: TEST_TABLE,
      idAlias: "modelId",
    });

    H.setActionsEnabledForDB(WRITABLE_DB_ID, true);
  }

  function setupDashboardAndAction() {
    let fieldId;
    H.getTable({ databaseId: WRITABLE_DB_ID, name: TEST_TABLE }).then(
      (table) => {
        fieldId = table.fields.find((field) => field.name === "id").id;
      },
    );

    cy.get("@modelId").then((modelId) => {
      H.createAction({ ...QUERY_ACTION, model_id: modelId }).then(
        ({ id: actionId }) => {
          cy.wrap(actionId).as("actionId");

          H.createDashboard(DASHBOARD_DETAILS).then(
            ({ body: { id: dashboardId } }) => {
              cy.wrap(dashboardId).as("dashboardId");

              H.updateDashboardCards({
                dashboard_id: dashboardId,
                cards: [
                  {
                    id: H.getNextUnsavedDashboardCardId(),
                    card_id: modelId,
                    // Map dashboard parameter to scoreboard_actions.id
                    parameter_mappings: [
                      {
                        parameter_id: ID_DASHBOARD_PARAMETER.id,
                        card_id: modelId,
                        target: ["dimension", ["field-id", fieldId, null]],
                      },
                    ],
                  },
                  H.getActionCardDetails({
                    label: QUERY_ACTION.name,
                    action_id: actionId,
                    // Map action's ID parameter to dashboard parameter
                    parameter_mappings: [
                      {
                        parameter_id: ID_DASHBOARD_PARAMETER.id,
                        target: [
                          "variable",
                          ["template-tag", ID_DASHBOARD_PARAMETER.slug],
                        ],
                      },
                    ],
                  }),
                ],
              });
            },
          );
        },
      );
    });
  }

  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TEST_TABLE });

    cy.signInAsAdmin();
    setupWritableDB();

    setupDashboardAndAction();
  });

  it("can submit query action linked with dashboard parameters (metabase#32974)", () => {
    H.visitDashboard("@dashboardId", { params: { id: 1 } });

    cy.log("Execute action");
    cy.button(QUERY_ACTION.name).click();
    H.modal().button(QUERY_ACTION.name).click();

    cy.log("Assertions");
    H.getDashboardCard().findByText(EXPECTED_UPDATED_VALUE).should("exist");
    H.modal().should("not.exist");
    H.undoToast().findByText("Query action ran successfully").should("exist");
  });
});

describe("metabase#31587", () => {
  const viewports = [
    [768, 800],
    [1024, 800],
    [1440, 800],
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);
  });

  it("should not allow action buttons to overflow when editing dashboard or viewing info sidebar (metabase#31587)", () => {
    viewports.forEach(([width, height]) => {
      cy.log(`Resolution ${width} x ${height}`);
      cy.viewport(width, height);

      H.createDashboard({ name: `Orders ${width} x ${height}` }).then(
        ({ body: { id: dashboardId } }) => {
          H.addOrUpdateDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            dashboard_id: dashboardId,
            card: { size_x: 16, size_y: 8 },
          });
          H.visitDashboard(dashboardId);
        },
      );

      H.editDashboard();
      cy.findByLabelText("Add action").click();

      cy.findByTestId("dashboard-parameters-and-cards").within(() => {
        assertActionButtonFitsDashcard();
      });

      H.saveDashboard();
      cy.icon("info").click();

      cy.findByTestId("dashboard-parameters-and-cards").within(() => {
        assertActionButtonFitsDashcard();
      });
    });
  });
});

describe("issue 32840", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    H.createQuestion(
      {
        type: "model",
        name: "Products model",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
      {
        wrapId: true,
        idAlias: "modelId",
      },
    );

    cy.get("@modelId").then((modelId) => {
      H.createAction({
        type: "implicit",
        kind: "row/update",
        name: "Update",
        model_id: modelId,
      });
      H.visitModel(modelId);
    });

    cy.intercept("POST", "/api/action/*/execute").as("executeAction");
  });

  it("uses correct timestamp when executing implicit update action (metabase#32840)", () => {
    cy.findAllByTestId("cell-data").eq(8).click();
    H.modal().within(() => {
      cy.findByText("July 19, 2026, 7:44 PM").should("be.visible");
      cy.findByTestId("actions-menu").click();
    });
    H.popover().findByText("Update").should("be.visible").click();
    H.modal()
      .eq(1)
      .within(() => {
        cy.findByPlaceholderText("Created At").should(
          "have.value",
          "2026-07-19T19:44:56",
        );
        cy.button("Update").scrollIntoView().click();
      });
    cy.wait("@executeAction");
    H.undoToast().findByText("Successfully updated").should("be.visible");
    H.modal().findByText("July 19, 2026, 7:44 PM").should("be.visible");

    cy.log("the stored timestamp is unchanged after reopening the row");
    cy.findByTestId("object-detail").icon("close").click();
    cy.findByTestId("object-detail").should("not.exist");
    cy.findAllByTestId("cell-data").eq(8).click();
    H.modal().within(() => {
      cy.findByText("July 19, 2026, 7:44 PM").should("be.visible");
      cy.findByTestId("actions-menu").click();
    });
    H.popover().findByText("Update").should("be.visible").click();
    H.modal()
      .eq(1)
      .findByPlaceholderText("Created At")
      .should("have.value", "2026-07-19T19:44:56");
  });
});

function createDashboardWithActionButton({
  actionName,
  idFilter = false,
  hideField,
}) {
  H.createDashboard({ name: "action packed dashboard" }).then(
    ({ body: { id: dashboardId } }) => {
      cy.wrap(dashboardId).as("dashboardId");
      H.visitDashboard(dashboardId);
    },
  );

  H.editDashboard();

  if (idFilter) {
    H.setFilter("ID");
    H.sidebar().within(() => {
      cy.button("Done").click();
    });
  }

  cy.button("Add action").click();
  cy.get("aside").within(() => {
    cy.findByPlaceholderText("Button text").clear().type(actionName);
    cy.button("Pick an action").click();
  });

  waitForValidActions();

  cy.findByRole("dialog").within(() => {
    cy.findByText(MODEL_NAME).click();
    cy.findByText(actionName).click();
  });

  if (hideField) {
    cy.findByRole("dialog").within(() => {
      cy.icon("pencil").click();
    });

    cy.findAllByRole("dialog")
      .filter(":visible")
      .within(() => {
        formFieldContainer(hideField).within(() => {
          toggleFieldVisibility();
        });

        cy.findByRole("button", { name: "Update" }).click();

        cy.wait("@updateAction");
      });

    cy.findByTestId("action-creator").should("not.exist");
  }

  if (idFilter) {
    cy.findByRole("dialog").within(() => {
      cy.findByText(/Where should the values/i).should("be.visible");
      cy.findByText(/has no parameters to map/i).should("not.exist");
      cy.findAllByDisplayValue(/ask the user/i)
        .first()
        .click();
    });
    H.selectDropdown().findByText("ID").click();
  }

  cy.findByRole("dialog").within(() => {
    cy.button("Done").click();
  });

  H.saveDashboard();
}

const changeValue = ({ fieldName, fieldType, oldValue, newValue }) => {
  cy.findByPlaceholderText(fieldName)
    .should("have.attr", "type", fieldType)
    .should("have.value", oldValue)
    .clear({ scrollBehavior: "center" })
    .type(newValue, { scrollBehavior: "center" });
};

function formFieldContainer(label) {
  return cy
    .findByLabelText(label)
    .closest("[data-testid=form-field-container]");
}

function openFieldSettings() {
  cy.icon("gear").click();
}

function toggleFieldVisibility() {
  cy.findByText("Show field").click();
}

function waitForValidActions() {
  cy.wait("@getActions").then(({ response }) => {
    const { body: actions } = response;

    actions.forEach((action) => {
      expect(action.parameters).to.have.length.gt(0);
    });
  });
}

function assertActionButtonFitsDashcard() {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("dashcard-container")
    .last()
    .should("have.text", "Click Me");

  cy.findByTestId("action-button-full-container")
    .find("button")
    .should(($button) => {
      const button = $button[0].getBoundingClientRect();
      const dashcard = $button
        .closest('[data-testid="dashcard-container"]')[0]
        .getBoundingClientRect();
      expect(button.bottom).to.be.at.most(dashcard.bottom + 0.5);
      expect(button.top).to.be.at.least(dashcard.top - 0.5);
      expect(button.height).to.be.closeTo(dashcard.height, 1);
    });
}
