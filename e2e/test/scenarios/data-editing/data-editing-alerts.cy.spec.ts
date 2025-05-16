import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

import {
  createNotificationWithCustomTemplate,
  verifyNotificationTemplate,
} from "./e2e-helpers/notification-helpers";
import { setupAlert } from "./e2e-helpers/setup";

const { H } = cy;

const TABLE_NAME = "colors27745";
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

describe("scenarios > data editing > setting alerts", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/notification").as("createNotification");

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

        cy.then(() => {
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
  });

  describe("Trigger an alert for each event type", () => {
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
          // Focus on second input, omitting "ID" field which is auto-populated.
          cy.get("input").eq(1).type("black");

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
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when new records are created/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplate(interception, CUSTOM_SUBJECT, CUSTOM_BODY);
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
          // Focus on second input, omitting "ID" field which is auto-populated.
          cy.get("input").eq(1).type("black");

          cy.findByRole("button", { name: "Create new record" }).click();
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "black",
        ]);
      });
    });

    describe("update event", () => {
      it("should trigger an alert for 'row updated' events with default template", () => {
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

      it("should trigger an alert for 'row updated' events with custom template", () => {
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when any cell changes it's value/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplate(interception, CUSTOM_SUBJECT, CUSTOM_BODY);
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

      it("should trigger an alert for 'row updated' events when condition is met", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when any cell changes it's value/i,
            })
            .click();

          cy.findByText("Add conditions for alerts").click();
          cy.findByPlaceholderText("Select column").click();
          cy.document()
            .findByRole("option", {
              name: /name/i,
            })
            .click();
          cy.findByPlaceholderText("Select value").click().type("white").blur();

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
          cy.focused().type("{selectall}{backspace}white").blur();
        });

        cy.wait(1000);

        cy.log("Testing custom email template");

        H.checkEmailContent(
          `A record was updated in "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was updated in Table ${TABLE_NAME}`, "white"],
        );
      });

      it("should not trigger an alert for 'row updated' events when condition is not met", () => {
        cy.findByTestId("table-notifications-trigger").click();

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when any cell changes it's value/i,
            })
            .click();

          cy.findByText("Add conditions for alerts").click();
          cy.findByPlaceholderText("Select column").click();
          cy.document()
            .findByRole("option", {
              name: /name/i,
            })
            .click();
          cy.findByPlaceholderText("Select value").click().type("white").blur();

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
          cy.focused().type("{selectall}{backspace}black").blur();
        });

        cy.wait(1000);

        // Alert on updated value was not sent, since it didn't meet the condition.
        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body.length).to.equal(1);
          expect(body[0].subject).to.include("You set up an alert");
        });
      });
    });

    describe("delete event", () => {
      it("should trigger an alert for 'row deleted' events with default template", () => {
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
          H.getTableId({
            name: TABLE_NAME,
          }).then((tableId) => {
            cy.request("POST", `/api/ee/data-editing/table/${tableId}/delete`, {
              rows: [{ id: 1 }],
              scope: { "table-id": tableId },
            });
          });
        });

        cy.wait(1000);

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A record was deleted from "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was deleted in Table ${TABLE_NAME}`],
        );
      });

      it("should trigger an alert for 'row deleted' events with custom template", () => {
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when records are deleted/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplate(interception, CUSTOM_SUBJECT, CUSTOM_BODY);
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
          H.getTableId({
            name: TABLE_NAME,
          }).then((tableId) => {
            cy.request("POST", `/api/ee/data-editing/table/${tableId}/delete`, {
              rows: [{ id: 1 }],
              scope: { "table-id": tableId },
            });
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

  describe("Update an existing alert", () => {
    it("should update an existing alert", () => {
      H.getTableId({
        name: TABLE_NAME,
      }).then((tableId) => {
        setupAlert(tableId, "event/row.created");
        cy.findByTestId("table-notifications-trigger").click();
        cy.findByTestId("alert-list-modal")
          .should("be.visible")
          .within(() => {
            cy.findByText("Notify when new records are created")
              .should("be.visible")
              .click();
          });

        cy.findByTestId("table-notification-create").within(() => {
          cy.findByText("Edit alert").should("be.visible");

          cy.findByTestId("notification-event-select").click();
          cy.document()
            .findByRole("option", {
              name: /when any cell changes it's value/i,
            })
            .click();

          cy.findByRole("button", { name: "Save changes" }).click();
        });

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Alert updated.").should("be.visible");
        });
      });
    });
  });

  describe("Delete an existing alert", () => {
    it("should delete an existing alert", () => {
      H.getTableId({
        name: TABLE_NAME,
      }).then((tableId) => {
        setupAlert(tableId, "event/row.created");
        cy.findByTestId("table-notifications-trigger").click();
        cy.findByTestId("alert-list-modal")
          .should("be.visible")
          .within(() => {
            cy.findByText("Notify when new records are created").realHover();
            cy.root().findByLabelText("Delete this alert").click();
            cy.document()
              .findByTestId("delete-confirm")
              .findByText("Delete it")
              .click();
          });

        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("The alert was successfully deleted.").should(
            "be.visible",
          );
        });
      });
    });
  });

  describe("Template preview", () => {
    it("should display default template preview", () => {
      cy.findByTestId("table-notifications-trigger").click();

      cy.findByTestId("table-notification-create").within(() => {
        cy.findByTestId("notification-event-select").click();
        cy.document()
          .findByRole("option", {
            name: /when new records are created/i,
          })
          .click();

        cy.intercept("POST", "/api/notification/preview_template").as(
          "previewTemplate",
        );

        cy.findByLabelText("Show preview").click();

        cy.wait("@previewTemplate");
        cy.findByTestId("preview-template-panel").should("be.visible");
        cy.findByTestId("preview-template-panel").within(() => {
          cy.root().contains(`A new record was added to "${TABLE_NAME}"`);
          cy.root().contains(`A new record was created in Table ${TABLE_NAME}`);
        });
      });
    });

    it("should display custom template preview", () => {
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

        cy.intercept("POST", "/api/notification/preview_template").as(
          "previewTemplate",
        );

        cy.findByLabelText("Show preview").click();

        cy.wait("@previewTemplate");
        cy.findByTestId("preview-template-panel").should("be.visible");
        cy.findByTestId("preview-template-panel").within(() => {
          cy.root().contains(`My custom subject for ${TABLE_NAME}`);
          cy.root().should("not.contain", "a new record was created");
          cy.root().contains(/id.*name/);
        });
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
