import { assocIn } from "icepick";

const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { many_data_types_rows } from "e2e/support/test_tables_data";
import { createMockActionParameter } from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../native/helpers/e2e-field-filter-helpers";

const TEST_TABLE = "scoreboard_actions";
const TEST_COLUMNS_TABLE = "many_data_types";
const MODEL_NAME = "Test Action Model";

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

        it("hides actions in public and static embed dashboards (metabase#34395)", () => {
          const dashboardDetails = {
            name: "Actions Dashboard",
          };

          const assertActionsHidden = () => {
            cy.findByRole("heading", { name: dashboardDetails.name }).should(
              "be.visible",
            );
            H.getDashboardCards().should("have.length", 1);
            H.getDashboardCard(0).findByText("Orders").should("be.visible");
            /**
             * cy.button("Create") doesn't work because the label is
             * `Actions are not enabled for this database` for disabled actions
             */
            cy.findByRole("main").findByText("Create").should("not.exist");
            cy.findByRole("link", { name: "Powered by Metabase" }).should(
              "be.visible",
            );
          };

          cy.get("@modelId")
            .then((id) => {
              H.createImplicitAction({
                kind: "create",
                model_id: id,
              });
            })
            .then(({ body: action }) => {
              H.createDashboard(dashboardDetails).then(
                ({ body: dashboard }) => {
                  H.updateDashboardCards({
                    dashboard_id: dashboard.id,
                    cards: [
                      H.getActionCardDetails({
                        action_id: action.id,
                        label: "Create",
                      }),
                      {
                        id: H.getNextUnsavedDashboardCardId(),
                        card_id: ORDERS_QUESTION_ID,
                        col: 4,
                        row: 0,
                        size_x: 11,
                        size_y: 8,
                      },
                    ],
                  });

                  H.createPublicDashboardLink(dashboard.id).then(
                    ({ body: { uuid } }) => {
                      cy.wrap(uuid).as("publicUuid");
                    },
                  );

                  cy.visit(`/dashboard/${dashboard.id}`);

                  cy.log("The action should be visible in the dashboard");
                  cy.findByRole("button", { name: "Create" }).should(
                    "be.visible",
                  );
                  H.getDashboardCards().should("have.length", 2);

                  cy.log("Visit static embed dashboard");
                  H.openLegacyStaticEmbeddingModal({
                    resource: "dashboard",
                    resourceId: dashboard.id,
                    activeTab: "parameters",
                    unpublishBeforeOpen: false,
                  });
                },
              );
            });

          H.visitIframe();

          cy.log("Assert static embed dashboard");
          assertActionsHidden();

          cy.log("Assert public dashboard");
          cy.get("@publicUuid").then((uuid) => {
            cy.visit(`/public/dashboard/${uuid}`);
          });
          assertActionsHidden();
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

      describe("editing action before executing it", () => {
        const WRITABLE_TEST_TABLE = "scoreboard_actions";

        const TEST_PARAMETER = createMockActionParameter({
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          name: "Total",
          slug: "total",
          type: "number/=",
          target: ["variable", ["template-tag", "total"]],
        });

        const TEST_TEMPLATE_TAG = {
          id: TEST_PARAMETER.id,
          type: "number",
          name: TEST_PARAMETER.slug,
          "display-name": TEST_PARAMETER.name,
          slug: TEST_PARAMETER.slug,
        };

        const SAMPLE_QUERY_ACTION = {
          name: "Demo Action",
          type: "query",
          parameters: [TEST_PARAMETER],
          database_id: WRITABLE_DB_ID,
          dataset_query: {
            type: "native",
            native: {
              query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
              "template-tags": {
                [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
              },
            },
            database: WRITABLE_DB_ID,
          },
          visualization_settings: {
            fields: {
              [TEST_PARAMETER.id]: {
                id: TEST_PARAMETER.id,
                required: true,
                fieldType: "number",
                inputType: "number",
              },
            },
          },
        };

        const SAMPLE_WRITABLE_QUERY_ACTION = assocIn(
          SAMPLE_QUERY_ACTION,
          ["dataset_query", "native", "query"],
          `UPDATE ${WRITABLE_TEST_TABLE} SET score = 22 WHERE id = {{ ${TEST_TEMPLATE_TAG.name} }}`,
        );

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

          cy.get("@modelId").then((modelId) => {
            H.createAction({
              ...SAMPLE_WRITABLE_QUERY_ACTION,
              model_id: modelId,
            });
          });

          createDashboardWithActionButton({
            actionName: SAMPLE_QUERY_ACTION.name,
          });
        });

        it("allows to edit action title, field placeholder, query and parameters in action execute modal", () => {
          clickHelper(SAMPLE_QUERY_ACTION.name);

          getActionParametersInputModal().within(() => {
            cy.icon("pencil").click();
          });

          actionEditorModal().within(() => {
            cy.findByText(SAMPLE_QUERY_ACTION.name)
              .click()
              .clear()
              .type("New action name");

            cy.findByTestId("action-form-editor").within(() => {
              cy.icon("gear").click();
            });
          });

          H.popover().within(() => {
            cy.findByText("Placeholder text").click().type("Test placeholder");
          });

          actionEditorModal().within(() => {
            cy.button("Update").click();
          });

          cy.wait("@updateAction");
          cy.findByTestId("action-editor-modal").should("not.exist");

          getActionParametersInputModal().within(() => {
            cy.findByTestId("modal-header").findByText("New action name");

            cy.findAllByPlaceholderText("Test placeholder");

            cy.icon("pencil").click();
          });

          actionEditorModal().within(() => {
            H.NativeEditor.clear();
            const TEST_COLUMNS_QUERY = `UPDATE ${TEST_COLUMNS_TABLE} SET timestamp = {{ Timestamp }} WHERE id = {{ ID }}`;
            H.NativeEditor.focus().type(TEST_COLUMNS_QUERY, {
              delay: 0,
              parseSpecialCharSequences: false,
            });

            cy.findByTestId("action-form-editor").within(() => {
              cy.contains("ID")
                .closest('[data-testid="form-field-container"]')
                .within(() => {
                  cy.findByRole("radiogroup", { name: "Field type" })
                    .findByText("Number")
                    .click();
                });
              cy.contains("Timestamp")
                .closest('[data-testid="form-field-container"]')
                .within(() => {
                  cy.findByRole("radiogroup", { name: "Field type" })
                    .findByText("Date")
                    .click();
                });
            });
          });

          actionEditorModal().within(() => {
            cy.button("Update").click();
          });

          cy.wait("@updateAction");
          cy.findByTestId("action-editor-modal").should("not.exist");

          getActionParametersInputModal().within(() => {
            cy.findByLabelText("Timestamp").type("2020-02-02");
            cy.findByLabelText("ID").type("1");

            cy.button("New action name").click();
          });

          cy.wait("@executeAction");

          cy.findByTestId("toast-undo").within(() => {
            cy.findByText("New action name ran successfully").should(
              "be.visible",
            );
          });

          H.queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
            dialect,
          ).then((result) => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].timestamp).to.include("2020-02-02");
          });
        });
      });
    },
  );
});

describe(
  "Action Parameters Mapping",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      cy.intercept("GET", /\/api\/card\/\d+/).as("getModel");
      cy.intercept("GET", "/api/action").as("getActions");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
      cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");

      cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute/values").as(
        "executePrefetch",
      );
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
        "executeAction",
      );
    });

    describe("Inline action edit", () => {
      beforeEach(() => {
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: TEST_TABLE });
        cy.signInAsAdmin();
        H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
        H.createModelFromTableName({
          tableName: TEST_TABLE,
          modelName: MODEL_NAME,
        });
      });

      it("refetches form values when id changes and shows constraint violation errors (metabase#33084)", () => {
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

        H.filterWidget().click();
        addWidgetStringFilter("5");

        cy.button(actionName).click();

        cy.wait("@executePrefetch");

        H.modal().within(() => {
          cy.findByPlaceholderText("Team Name").should(
            "have.value",
            "Energetic Elephants",
          );
          cy.findByPlaceholderText("Score").should("have.value", "30");

          cy.icon("close").click();
        });

        H.filterWidget().click();
        H.dashboardParametersPopover().within(() => {
          H.fieldValuesCombobox().type("{backspace}10");
        });
        cy.button("Update filter").click();

        cy.button(actionName).click();

        cy.wait("@executePrefetch");

        H.modal().within(() => {
          cy.findByPlaceholderText("Team Name").should(
            "have.value",
            "Jolly Jellyfish",
          );
          cy.findByPlaceholderText("Score").should("have.value", "60");

          cy.log("shows constraint violation errors from the database");
          cy.findByPlaceholderText("Team Name").clear().type("Kind Koalas");
          cy.button(actionName).click();
        });

        cy.wait("@executeAction");

        H.modal().within(() => {
          cy.findByLabelText("Team Name").should("exist");
          cy.findByText("This Team_name value already exists.").should("exist");

          cy.findByText("Team_name already exists.").should("exist");
        });
      });

      it("should reflect to updated action on mapping form", () => {
        const ACTION_NAME = "Update Score";

        cy.get("@modelId").then((id) => {
          cy.visit(`/model/${id}/detail`);
          cy.wait(["@getModel", "@getModelActions"]);
        });

        cy.findByTestId("model-actions-header")
          .findByText("New action")
          .click();

        cy.findByRole("dialog").within(() => {
          H.fillActionQuery(
            `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }}`,
          );
        });

        cy.findByRole("dialog").within(() => {
          cy.findByText("Save").click();
        });

        cy.findByPlaceholderText("My new fantastic action").type(ACTION_NAME);
        cy.findByTestId("create-action-form").button("Create").click();

        H.createDashboard({ name: "action packed dashboard" }).then(
          ({ body: { id: dashboardId } }) => {
            H.visitDashboard(dashboardId);
          },
        );

        H.editDashboard();

        H.setFilter("ID");
        H.sidebar().within(() => {
          cy.button("Done").click();
        });

        cy.button("Add action").click();
        cy.get("aside").within(() => {
          cy.findByPlaceholderText("Button text").clear().type(ACTION_NAME);
          cy.button("Pick an action").click();
        });

        waitForValidActions();

        cy.findByRole("dialog").within(() => {
          cy.findByText(MODEL_NAME).click();
          cy.findByText(ACTION_NAME).click();

          cy.findByText("New Score: required").should("not.exist");
          cy.findByRole("button", { name: "Done" }).should("be.enabled");
          cy.icon("pencil").click();
        });

        cy.wait("@getModel");

        cy.findAllByRole("dialog")
          .filter(":visible")
          .within(() => {
            formFieldContainer("New Score").within(() => {
              toggleFieldVisibility();
            });

            cy.findByRole("button", { name: "Update" }).click();
          });

        cy.wait("@updateAction");

        // The action editor closes after the update; wait until only the
        // parameter mapping dialog remains.
        cy.findByTestId("action-creator").should("not.exist");

        cy.findByRole("dialog").within(() => {
          cy.findByText("New Score: required");
          cy.findByRole("button", { name: "Done" }).should("be.disabled");
        });
      });
    });
  },
);

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

      cy.wait("@getModel");
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
    .clear()
    .type(newValue);
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

const clickHelper = (buttonName) => {
  // this is dirty, but it seems to be the only reliable solution to detached elements before cypress v12
  // https://github.com/cypress-io/cypress/issues/7306
  cy.wait(100);
  cy.button(buttonName).click();
};

function actionEditorModal() {
  return cy.findByTestId("action-editor-modal");
}

function getActionParametersInputModal() {
  return cy.findByTestId("action-parameters-input-modal");
}

function waitForValidActions() {
  cy.wait("@getActions").then(({ response }) => {
    const { body: actions } = response;

    actions.forEach((action) => {
      expect(action.parameters).to.have.length.gt(0);
    });
  });
}
