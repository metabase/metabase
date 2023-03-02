import {
  restore,
  queryWritableDB,
  resetTestTable,
  getTableId,
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
} from "e2e/support/helpers";

import { many_data_types_rows } from "e2e/support/test_tables_data";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

const TEST_TABLE = "scoreboard_actions";
const TEST_COLUMNS_TABLE = "many_data_types";
const MODEL_NAME = "Test Action Model";

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
        cy.intercept("GET", "/api/action?model-id=*").as("getActions");

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
          resyncDatabase(WRITABLE_DB_ID);
        });

        it("adds a custom query action to a dashboard and runs it", () => {
          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(0);
          });

          createModelFromTable(TEST_TABLE);

          cy.get("@modelId").then(id => {
            cy.visit(`/model/${id}/detail`);
            cy.wait(["@getModel", "@getActions", "@getCardAssociations"]);
          });

          cy.findByRole("tab", { name: "Actions" }).click();
          cy.findByText("New action").click();

          cy.findByRole("dialog").within(() => {
            fillActionQuery(
              `INSERT INTO ${TEST_TABLE} (team_name) VALUES ('Zany Zebras')`,
            );
            cy.findByText("Save").click();
          });

          cy.findByPlaceholderText("My new fantastic action").type(
            "Add Zebras",
          );
          cy.findByText("Create").click();

          createDashboardWithActionButton({
            actionName: "Add Zebras",
          });

          clickHelper("Add Zebras");

          cy.wait("@executeAPI");

          queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
            dialect,
          ).then(result => {
            expect(result.rows.length).to.equal(1);
          });
        });

        it("adds an implicit create action to a dashboard and runs it", () => {
          createModelFromTable(TEST_TABLE);
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Create",
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("Team name").type("Zany Zebras");
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

          createModelFromTable(TEST_TABLE);

          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName,
            idFilter: true,
          });

          filterWidget().click();
          addWidgetStringFilter("5");

          clickHelper(actionName);

          cy.wait("@executePrefetch");
          // let's check that the existing values are pre-filled correctly
          modal().within(() => {
            cy.findByPlaceholderText("Team name")
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

          createModelFromTable(TEST_TABLE);

          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "delete",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Delete",
          });

          clickHelper("Delete");

          modal().within(() => {
            cy.findByPlaceholderText("Id").type("3");
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
      });

      describe(`Actions Data Types`, () => {
        beforeEach(() => {
          resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
          restore(`${dialect}-writable`);
          cy.signInAsAdmin();
          resyncDatabase(WRITABLE_DB_ID);
        });

        it("can update various data types via implicit actions", () => {
          createModelFromTable(TEST_COLUMNS_TABLE);
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
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
              fieldName: "Uuid",
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
            cy.findByPlaceholderText("Timestamptz")
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
          createModelFromTable(TEST_COLUMNS_TABLE);
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Create",
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("Uuid").type(
              "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
            );

            cy.findByPlaceholderText("Integer").type("-20");
            cy.findByPlaceholderText("Integerunsigned").type("20");
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
            cy.findByPlaceholderText("Datetimetz").type("2020-03-01T12:00:00");
            cy.findByPlaceholderText("Time").type("12:57:57");
            cy.findByPlaceholderText("Timestamp").type("2020-03-01T12:00:00");
            cy.findByPlaceholderText("Timestamptz").type("2020-03-01T12:00:00");

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
          createModelFromTable(TEST_COLUMNS_TABLE);
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "create",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
            actionName: "Create",
            idFilter: true,
          });

          clickHelper("Create");

          modal().within(() => {
            cy.findByPlaceholderText("Uuid").should("be.visible");
            cy.findByPlaceholderText("Json").should("not.exist");
            cy.findByPlaceholderText("Jsonb").should("not.exist");
            cy.findByPlaceholderText("Binary").should("not.exist");

            if (dialect === "mysql") {
              // we only have enums in postgres as of Feb 2023
              cy.findByPlaceholderText("Enum").should("not.exist");
            }
          });
        });

        it("properly loads and updates date and time fields for implicit update actions", () => {
          createModelFromTable(TEST_COLUMNS_TABLE);
          cy.get("@modelId").then(id => {
            createImplicitAction({
              kind: "update",
              model_id: id,
            });
          });

          createDashboardWithActionButton({
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
                fieldName: "Datetimetz",
                fieldType: "datetime-local",
                oldValue: "2020-01-01T00:35:55",
                newValue: newTime,
              });

              changeValue({
                fieldName: "Timestamptz",
                fieldType: "datetime-local",
                oldValue: "2020-01-01T00:35:55",
                newValue: newTime,
              });
            }

            if (dialect === "mysql") {
              changeValue({
                fieldName: "Datetimetz",
                fieldType: "datetime-local",
                oldValue: oldRow.datetimeTZ.replace(" ", "T"),
                newValue: newTime,
              });

              changeValue({
                fieldName: "Timestamptz",
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
    });
});

const createModelFromTable = tableName => {
  getTableId({ name: tableName }).then(tableId => {
    cy.createQuestion(
      {
        database: WRITABLE_DB_ID,
        name: MODEL_NAME,
        query: {
          "source-table": tableId,
        },
        dataset: true,
      },
      {
        wrapId: true,
        idAlias: "modelId",
      },
    );
  });
};

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

  if (idFilter) {
    cy.findByRole("dialog").within(() => {
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
