import {
  restore,
  queryWritableDB,
  resetTestTable,
  createModelFromTableName,
  fillActionQuery,
  resyncDatabase,
  visitDashboard,
  editDashboard,
  saveDashboard,
  modal,
  setFilter,
  sidebar,
  popover,
  filterWidget,
  createImplicitAction,
  dragField,
  setActionsEnabledForDB,
  createAction,
} from "e2e/support/helpers";

import { many_data_types_rows } from "e2e/support/test_tables_data";
import { createMockActionParameter } from "metabase-types/api/mocks";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

const TEST_TABLE = "scoreboard_actions";
const TEST_COLUMNS_TABLE = "many_data_types";
const MODEL_NAME = "Test Action Model";

const PG_DB_ID = 2;
const PG_ORDERS_TABLE_ID = 9;
const WRITABLE_TEST_TABLE = "scoreboard_actions";

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  database: PG_DB_ID,
  query: {
    "source-table": PG_ORDERS_TABLE_ID,
  },
};

["mysql", "postgres"].forEach(dialect => {
  describe(
    `Write Actions on Dashboards (${dialect})`,
    { tags: ["@external", "@actions"] },
    () => {
      beforeEach(() => {
        cy.intercept("GET", /\/api\/card\/\d+/).as("getModel");
        cy.intercept("GET", "/api/card?f=using_model&model_id=**").as(
          "getCardAssociations",
        );
        cy.intercept("GET", "/api/action").as("getActions");
        cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");

        cy.intercept(
          "GET",
          "/api/dashboard/*/dashcard/*/execute?parameters=*",
        ).as("executePrefetch");

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
          "executeAPI",
        );
      });

      describe("adding and executing actions", () => {
        beforeEach(() => {
          resetTestTable({ type: dialect, table: TEST_TABLE });
          restore(`${dialect}-writable`);
          cy.signInAsAdmin();
          resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
          createModelFromTableName({
            tableName: TEST_TABLE,
            modelName: MODEL_NAME,
          });
        });

        it("adds a custom query action to a dashboard and runs it", () => {
          const ACTION_NAME = "Update Score";

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].score).to.equal(0);
          });

          cy.get("@modelId").then(id => {
            cy.visit(`/model/${id}/detail`);
            cy.wait(["@getModel", "@getModelActions", "@getCardAssociations"]);
          });

          cy.findByRole("tab", { name: "Actions" }).click();

          cy.findByTestId("model-actions-header")
            .findByText("New action")
            .click();

          cy.findByRole("dialog").within(() => {
            fillActionQuery(
              `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }}`,
            );
          });

          // can't have this in the .within() because it needs access to document.body
          dragField(1, 0);

          cy.findByRole("dialog").within(() => {
            cy.findAllByText("Number").each(el => {
              cy.wrap(el).click();
            });
            cy.findByText("Save").click();
          });

          cy.findByPlaceholderText("My new fantastic action").type(ACTION_NAME);
          cy.findByTestId("create-action-form").button("Create").click();

          createAndSaveDashboardWithActionButton({
            actionName: ACTION_NAME,
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("1");

          clickHelper("Update Score");

          cy.findByRole("dialog").within(() => {
            cy.findByLabelText("New Score").type("55");
            cy.button(ACTION_NAME).click();
          });

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].score).to.equal(55);
          });
        });

        it("adds an implicit create action to a dashboard and runs it", () => {
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Create",
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("Team Name").type("Zany Zebras");
            cy.findByPlaceholderText("Score").type("44");

            cy.button("Save").click();
          });

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);

            expect(result.rows[0].score).to.equal(44);
          });
        });

        it("adds an implicit update action to a dashboard and runs it", () => {
          const actionName = "Update";

          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName,
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("5");

          clickHelper(actionName);

          cy.wait("@executePrefetch");
          // let's check that the existing values are pre-filled correctly
          modal().within(() => {
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

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Emotional Elephants'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);

            expect(result.rows[0].score).to.equal(88);
          });
        });

        it("adds an implicit delete action to a dashboard and runs it", () => {
          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);
            expect(result.rows[0].id).to.equal(3);
          });

          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "delete",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Delete",
          });

          clickHelper("Delete");

          modal().within(() => {
            cy.findByPlaceholderText("ID").type("3");
            cy.button("Delete").click();
          });

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(0);
          });
        });

        it("add an implicit Update action with hidden fields and runs it", () => {
          const actionName = "Update";
          const IMPLICIT_ACTION_FIELD_TO_HIDE = "created_at";

          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            }).then(({ body }) => {
              cy.wrap(body).as("implicitAction");
            });

            cy.get("@implicitAction").then(implicitAction => {
              const actionPayload = {
                visualization_settings: {
                  ...implicitAction.visualization_settings,
                  fields: {
                    ...implicitAction.visualization_settings.fields,
                    [IMPLICIT_ACTION_FIELD_TO_HIDE]: {
                      ...implicitAction.visualization_settings.fields[
                        IMPLICIT_ACTION_FIELD_TO_HIDE
                      ],
                      hidden: true,
                    },
                  },
                },
              };

              cy.request(
                "PUT",
                `/api/action/${implicitAction.id}`,
                actionPayload,
              );
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName,
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("5");

          clickHelper(actionName);

          cy.wait("@executePrefetch");

          // checking that hidden field "created_at" is actually hidden
          modal().within(() => {
            cy.findByPlaceholderText("Team Name").should(
              "have.value",
              "Energetic Elephants",
            );

            cy.findByPlaceholderText("Created At").should("not.exist");

            cy.findByRole("button", { name: "Update" }).click();
          });

          cy.findByTestId("toast-undo").should(
            "have.text",
            "Successfully updated",
          );
        });
      });

      describe(`Actions Data Types`, () => {
        beforeEach(() => {
          resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
          restore(`${dialect}-writable`);
          cy.signInAsAdmin();
          resyncDatabase({
            dbId: WRITABLE_DB_ID,
            tableName: TEST_COLUMNS_TABLE,
          });
          createModelFromTableName({
            tableName: TEST_COLUMNS_TABLE,
            modelName: MODEL_NAME,
          });
        });

        it("can update various data types via implicit actions", () => {
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Update",
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("1");

          clickHelper("Update");

          cy.wait("@executePrefetch");

          const oldRow = many_data_types_rows[0];

          modal().within(() => {
            changeValue({
              fieldName: "UUID",
              fieldType: "text",
              oldValue: oldRow.uuid,
              newValue: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77",
            });

            changeValue({
              fieldName: "Integer",
              fieldType: "number",
              oldValue: oldRow.integer,
              newValue: 123,
            });

            changeValue({
              fieldName: "Float",
              fieldType: "number",
              oldValue: oldRow.float,
              newValue: 2.2,
            });

            cy.findByLabelText("Boolean").should("be.checked").click();

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
              newValue: "2020-05-01",
            });

            // we can't assert on this value because mysql and postgres seem to
            // handle timezones differently 🥴
            cy.findByPlaceholderText("TimestampTZ")
              .should("have.attr", "type", "datetime-local")
              .clear()
              .type("2020-05-01T16:45:00");

            cy.button("Update").click();
          });

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
            dialect,
          ).then(result => {
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
            expect(row.date).to.include("2020-05-01"); // js converts this to a full date obj
            expect(row.timestampTZ).to.include("2020-05-01"); // we got timezone issues here
          });
        });

        it("can insert various data types via implicit actions", () => {
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Create",
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("UUID").type(
              "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
            );

            cy.findByPlaceholderText("Integer").type("-20");
            cy.findByPlaceholderText("IntegerUnsigned").type("20");
            cy.findByPlaceholderText("Tinyint").type("101");
            cy.findByPlaceholderText("Tinyint1").type("1");
            cy.findByPlaceholderText("Smallint").type("32767");
            cy.findByPlaceholderText("Mediumint").type("8388607");
            cy.findByPlaceholderText("Bigint").type("922337204775");
            cy.findByPlaceholderText("Float").type("3.4");
            cy.findByPlaceholderText("Double").type("1.79769313486");
            cy.findByPlaceholderText("Decimal").type("123901.21");

            cy.findByLabelText("Boolean").click();

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

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE string = 'Zany Zebras'`,
            dialect,
          ).then(result => {
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
        });

        it("does not show json, enum, or binary columns for implicit actions", () => {
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Create",
            idFilter: true,
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("UUID").should("be.visible");
            cy.findByPlaceholderText("JSON").should("not.exist");
            cy.findByPlaceholderText("JSONB").should("not.exist");
            cy.findByPlaceholderText("Binary").should("not.exist");

            if (dialect === "mysql") {
              // we only have enums in postgres as of Feb 2023
              cy.findByPlaceholderText("Enum").should("not.exist");
            }
          });
        });

        it("properly loads and updates date and time fields for implicit update actions", () => {
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createAndSaveDashboardWithActionButton({
            actionName: "Update",
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("1");

          clickHelper("Update");

          cy.wait("@executePrefetch");

          const oldRow = many_data_types_rows[0];
          const newTime = "2020-01-10T01:35:55";

          modal().within(() => {
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

            // only postgres has timezone-aware columns
            // the instance is in US/Pacific so it's -8 hours
            if (dialect === "postgres") {
              changeValue({
                fieldName: "DatetimeTZ",
                fieldType: "datetime-local",
                oldValue: "2020-01-01T00:35:55",
                newValue: newTime,
              });

              changeValue({
                fieldName: "TimestampTZ",
                fieldType: "datetime-local",
                oldValue: "2020-01-01T00:35:55",
                newValue: newTime,
              });
            }

            if (dialect === "mysql") {
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
            }
            cy.button("Update").click();
          });

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
            dialect,
          ).then(result => {
            const row = result.rows[0];

            // the driver adds a time to this date so we have to use .include
            expect(row.date).to.include(newTime.slice(0, 10));
            expect(row.time).to.equal(newTime.slice(-8));

            // metabase is smart and localizes these, so all of these are +8 hours
            const newTimeAdjusted = newTime.replace("T01", "T09");
            // we need to use .include because the driver adds milliseconds to the timestamp
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

const TEST_PARAMETER = createMockActionParameter({
  id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
  name: "Total",
  slug: "total",
  type: "number/=",
  target: ["variable", ["template-tag", "total"]],
});

const TEST_PARAMETER_2 = createMockActionParameter({
  id: "f6c36b0e-e2a2-4ccb-8b97-ea148c60e99b",
  name: "Score",
  slug: "score",
  type: "number/=",
  target: ["variable", ["template-tag", "score"]],
});

const TEST_TEMPLATE_TAG = {
  id: TEST_PARAMETER.id,
  type: "number",
  name: TEST_PARAMETER.slug,
  "display-name": TEST_PARAMETER.name,
  slug: TEST_PARAMETER.slug,
};
const TEST_TEMPLATE_TAG_2 = {
  id: TEST_PARAMETER_2.id,
  type: "number",
  name: TEST_PARAMETER_2.slug,
  "display-name": TEST_PARAMETER_2.name,
  slug: TEST_PARAMETER_2.slug,
};

const SAMPLE_QUERY_ACTION = {
  name: "Demo Action",
  type: "query",
  database_id: PG_DB_ID,
  parameters: [TEST_PARAMETER, TEST_PARAMETER_2],
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ${WRITABLE_TEST_TABLE} SET score = {{ ${TEST_TEMPLATE_TAG_2.name} }} WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
        [TEST_TEMPLATE_TAG_2.name]: TEST_TEMPLATE_TAG_2,
      },
    },
  },
  visualization_settings: {
    fields: {
      [TEST_PARAMETER.id]: {
        id: TEST_PARAMETER.id,
        required: true,
        hidden: false,
        fieldType: "number",
        inputType: "number",
      },
      [TEST_PARAMETER_2.id]: {
        id: TEST_PARAMETER_2.id,
        required: true,
        hidden: true,
        fieldType: "number",
        inputType: "number",
      },
    },
  },
};

describe(
  "Validate Actions Parameters on Dashboards",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
      setActionsEnabledForDB(PG_DB_ID);

      cy.createQuestion(SAMPLE_ORDERS_MODEL, {
        wrapId: true,
        idAlias: "modelId",
      });

      cy.intercept("GET", "/api/card/*").as("getModel");
      cy.intercept("PUT", "/api/action/*").as("updateAction");

      cy.intercept("GET", "/api/action").as("getActions");
    });

    it("validates mapping for hidden required parameters for query action", () => {
      cy.get("@modelId").then(modelId => {
        createAction({
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
      });

      createDashboardWithActionButton({
        actionName: SAMPLE_QUERY_ACTION.name,
        idFilter: true,
        modelName: SAMPLE_ORDERS_MODEL.name,
      });

      cy.findByRole("dialog").within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("Score: required");
        cy.findByText("Hidden");
        cy.findByText("Select a value").click();
      });

      popover().within(() => {
        cy.findByText("ID").click();
      });

      cy.findByRole("dialog").within(() => {
        cy.findByText("Hidden");
        cy.findByText("Score: required").should("not.exist");
        cy.button("Done").should("be.enabled");
      });
    });

    it("validates mapping for hidden required parameters for implicit action", () => {
      const ACTION_NAME = "Update";
      const IMPLICIT_ACTION_FIELD_TO_HIDE = "id";

      cy.get("@modelId").then(modelId => {
        createImplicitAction({
          kind: "update",
          model_id: modelId,
        }).then(({ body }) => {
          const implicitAction = body;

          const actionPayload = {
            visualization_settings: {
              ...implicitAction.visualization_settings,
              fields: {
                ...implicitAction.visualization_settings.fields,
                [IMPLICIT_ACTION_FIELD_TO_HIDE]: {
                  ...implicitAction.visualization_settings.fields[
                    IMPLICIT_ACTION_FIELD_TO_HIDE
                  ],
                  hidden: true,
                },
              },
            },
          };

          cy.request("PUT", `/api/action/${implicitAction.id}`, actionPayload);
        });
      });

      createDashboardWithActionButton({
        actionName: ACTION_NAME,
        idFilter: true,
        modelName: SAMPLE_ORDERS_MODEL.name,
      });

      cy.findByRole("dialog").within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText(`${IMPLICIT_ACTION_FIELD_TO_HIDE}: required`);
        cy.findByText("Hidden");
        cy.findByText("Select a value").click();
      });

      popover().within(() => {
        cy.findByText("ID").click();
      });

      cy.findByRole("dialog").within(() => {
        cy.findByText("Hidden");
        cy.findByText(`${IMPLICIT_ACTION_FIELD_TO_HIDE}: required`).should(
          "not.exist",
        );
        cy.button("Done").should("be.enabled");
      });
    });
  },
);

function createAndSaveDashboardWithActionButton({
  actionName,
  modelName = MODEL_NAME,
  idFilter = false,
}) {
  createDashboardWithActionButton({ actionName, modelName, idFilter });

  if (idFilter) {
    cy.findByRole("dialog").within(() => {
      cy.findByText(/has no parameters to map/i).should("not.exist");
      cy.findByText(/Where should the values/i);
      cy.findAllByText(/ask the user/i)
        .first()
        .click();
    });
    popover().within(() => {
      cy.findByText("ID").click();
    });
  }

  cy.findByRole("dialog").within(() => {
    cy.button("Done").click();
  });

  saveDashboard();
}

function createDashboardWithActionButton({
  actionName,
  modelName = MODEL_NAME,
  idFilter = false,
}) {
  cy.createDashboard({ name: "action packed dashboard" }).then(
    ({ body: { id: dashboardId } }) => {
      visitDashboard(dashboardId);
    },
  );

  editDashboard();

  if (idFilter) {
    setFilter("ID");
    sidebar().within(() => {
      cy.button("Done").click();
    });
  }

  cy.button("Add action").click();
  cy.get("aside").within(() => {
    cy.findByPlaceholderText("Button text").clear().type(actionName);
    cy.button("Pick an action").click();
  });

  cy.wait("@getActions");

  cy.findByRole("dialog").within(() => {
    cy.findByText(modelName).click();
    cy.findByText(actionName).click();
  });
}

const changeValue = ({ fieldName, fieldType, oldValue, newValue }) => {
  cy.findByPlaceholderText(fieldName)
    .should("have.attr", "type", fieldType)
    .should("have.value", oldValue)
    .clear()
    .type(newValue);
};

const clickHelper = buttonName => {
  // this is dirty, but it seems to be the only reliable solution to detached elements before cypress v12
  // https://github.com/cypress-io/cypress/issues/7306
  cy.wait(100);
  cy.button(buttonName).click();
};
