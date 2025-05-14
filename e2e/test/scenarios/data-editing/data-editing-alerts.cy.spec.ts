import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

import { setupAlert } from "./helpers/setup";

const { H } = cy;

const TABLE_NAME = "colors27745";
const TABLE_ID = 22;
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

describe("scenarios > data editing > setting alerts", () => {
  beforeEach(() => {
    cy.log("Setting up writable PostgresDB");
    H.restore("postgres-writable");
    H.resetTestTable({
      type: "postgres",
      table: TABLE_NAME,
    });
    cy.signInAsAdmin();
    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE_NAME,
    });

    H.setTokenFeatures("all");
    H.setupSMTP();

    H.setTableEditingEnabledForDB(WRITABLE_DB_ID);

    openDatabaseTable();
  });

  it("should have icon to set alerts", () => {
    cy.findByTestId("table-notifications-trigger").should("be.visible");
  });

  describe("Show list of existing alerts", () => {
    it("should show list of existing alerts", () => {
      H.getTableId({
        name: TABLE_NAME,
      }).then((tableId) => {
        setupAlert(tableId, "event/row.created");
        setupAlert(tableId, "event/row.updated");
        setupAlert(tableId, "event/row.deleted");
        cy.findByTestId("table-notifications-trigger").click();
        cy.findByTestId("alert-list-modal")
          .should("be.visible")
          .within(() => {
            cy.findByText("Notify when new records are created").should(
              "be.visible",
            );
            cy.findByText("Notify when records are updated").should(
              "be.visible",
            );
            cy.findByText("Notify when records are deleted").should(
              "be.visible",
            );
          });
      });
    });
  });

  describe("Create an alert for each event type", () => {
    describe("create event", () => {
      it("should create an alert for 'row created' events with default template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when new records are created/i,
            })
            .click();
          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-data-view-header").within(() => {
          cy.findByText("New record").click();
        });

        H.modal().within(() => {
          // Focus on 1st input, no other way to select it currently.
          cy.findByPlaceholderText("Required").type("10003");

          cy.findByRole("button", { name: "Create new record" }).click();
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A new record was added to "${TABLE_NAME}" by ${ADMIN_NAME}`,
          `A new record was created in Table ${TABLE_NAME}`,
        );
      });

      it("should create an alert for 'row created' events with custom template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when new records are created/i,
            })
            .click();

          cy.findByTestId("email-template-subject")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "My custom subject for {{table.name}}")
            .blur();

          cy.findByTestId("email-template-body")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "{{#each record}} {{@key}}: {{@value}} {{/each}}")
            .blur();

          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-data-view-header").within(() => {
          cy.findByText("New record").click();
        });

        H.modal().within(() => {
          // Focus on 1st input, no other way to select it currently.
          cy.findByPlaceholderText("Required").type("10003");

          cy.findByRole("button", { name: "Create new record" }).click();
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "10003",
        ]);
      });
    });

    describe("update event", () => {
      it("should create an alert for 'row updated' events with default template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when any cell changes it's value/i,
            })
            .click();
          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-body").within(() => {
          cy.findByText("red").click();
          cy.focused().type("blue").blur();
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A record was updated in "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was updated in Table ${TABLE_NAME}`, "redblue"],
        );
      });

      it("should create an alert for 'row updated' events with custom template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when any cell changes it's value/i,
            })
            .click();

          cy.findByTestId("email-template-subject")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "My custom subject for {{table.name}}")
            .blur();

          cy.findByTestId("email-template-body")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "{{#each record}} {{@key}}: {{@value}} {{/each}}")
            .blur();

          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-body").within(() => {
          cy.findByText("red").click();
          cy.focused().type("blue").blur();
        });

        cy.wait(1000);

        cy.log("Testing custom email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "name",
          "redblue",
        ]);
      });
    });

    describe("delete event", () => {
      it("should create an alert for 'row deleted' events with default template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when records are deleted/i,
            })
            .click();
          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-body").within(() => {
          cy.get("[data-index=0]").within(() => {
            cy.findByRole("checkbox").click();
          });
        });

        cy.findByTestId("table-data-view-header").within(() => {
          // TODO: Uncomment when button is working and delete request & wait
          // cy.findByText("Delete").click();
          cy.request("POST", `/api/ee/data-editing/table/${TABLE_ID}/delete`, {
            rows: [{ id: 1 }],
            scope: { "table-id": TABLE_ID },
          });
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A record was deleted from "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was deleted in Table ${TABLE_NAME}`],
        );
      });

      it.only("should create an alert for 'row deleted' events with custom template", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when records are deleted/i,
            })
            .click();

          cy.findByTestId("email-template-subject")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "My custom subject for {{table.name}}")
            .blur();

          cy.findByTestId("email-template-body")
            .findByRole("textbox")
            .click({ force: true })
            .invoke("text", "{{#each record}} {{@key}}: {{@value}} {{/each}}")
            .blur();

          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByTestId("table-notification-create").should("not.exist");

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert created.").should("be.visible");
        });

        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body[0].subject).to.include("You set up an alert");
        });

        cy.findByTestId("table-body").within(() => {
          cy.get("[data-index=0]").within(() => {
            cy.findByRole("checkbox").click();
          });
        });

        cy.findByTestId("table-data-view-header").within(() => {
          // TODO: Uncomment when button is working and delete request & wait
          // cy.findByText("Delete").click();
          cy.request("POST", `/api/ee/data-editing/table/${TABLE_ID}/delete`, {
            rows: [{ id: 1 }],
            scope: { "table-id": TABLE_ID },
          });
        });

        cy.wait(1000);

        cy.log("Testing custom email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "name",
        ]);
      });
    });
  });
});

function openDatabaseTable() {
  H.getTableId({
    name: TABLE_NAME,
  }).then((tableId) => {
    cy.visit(`/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`);
  });
}
