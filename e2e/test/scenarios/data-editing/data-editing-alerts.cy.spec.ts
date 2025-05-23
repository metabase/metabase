import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

import {
  createNotificationWithCustomTemplate,
  fillInCustomTemplate,
  verifyNotificationTemplateResponse,
} from "./e2e-helpers/notification-helpers";
import { setupAlert } from "./e2e-helpers/setup";

const { H } = cy;

const TABLE_NAME = "colors27745";
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

describe("scenarios > data editing > setting alerts", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/notification").as("getNotification");
    cy.intercept("POST", "/api/notification").as("createNotification");
    cy.intercept("POST", "/api/ee/data-editing/table/*").as("createRecord");
    cy.intercept("PUT", "/api/ee/data-editing/table/*").as("updateRecord");
    cy.intercept("POST", "/api/ee/data-editing/table/**/delete").as(
      "deleteRecord",
    );

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
  });

  it("should have icon to set alerts", () => {
    openDatabaseTable();
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
      });

      openDatabaseTable();

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

  describe("Trigger an alert for each event type", () => {
    describe("create event", () => {
      it("should create an alert for 'row created' events with default template", () => {
        openDatabaseTable();

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
          cy.wait("@createRecord");
        });

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A new record was added to "${TABLE_NAME}" by ${ADMIN_NAME}`,
          `A new record was created in Table ${TABLE_NAME}`,
        );
      });

      it("should create an alert for 'row created' events with custom template", () => {
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        openDatabaseTable();

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when new records are created/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplateResponse(
            interception,
            CUSTOM_SUBJECT,
            CUSTOM_BODY,
          );
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

        cy.wait("@createRecord");

        cy.log("Testing default email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "black",
        ]);
      });
    });

    describe("update event", () => {
      it("should trigger an alert for 'row updated' events with default template", () => {
        openDatabaseTable();

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

        cy.wait("@updateRecord");

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A record was updated in "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was updated in Table ${TABLE_NAME}`, "redblue"],
        );
      });

      it("should trigger an alert for 'row updated' events with custom template", () => {
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        openDatabaseTable();

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when any cell changes it's value/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplateResponse(
            interception,
            CUSTOM_SUBJECT,
            CUSTOM_BODY,
          );
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

        cy.wait("@updateRecord");

        cy.log("Testing custom email template");

        H.checkEmailContent(`My custom subject for ${TABLE_NAME}`, [
          "id",
          "name",
          "redblue",
        ]);
      });

      it("should trigger an alert for 'row updated' events when condition is met", () => {
        openDatabaseTable();

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

        cy.wait("@updateRecord");

        cy.log("Testing custom email template");

        H.checkEmailContent(
          `A record was updated in "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was updated in Table ${TABLE_NAME}`, "white"],
        );
      });

      it("should not trigger an alert for 'row updated' events when condition is not met", () => {
        openDatabaseTable();

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

        cy.wait("@updateRecord");

        // Alert on updated value was not sent, since it didn't meet the condition.
        H.getInbox().then(({ body }: { body: { subject: string }[] }) => {
          expect(body.length).to.equal(1);
          expect(body[0].subject).to.include("You set up an alert");
        });
      });
    });

    describe("delete event", () => {
      it("should trigger an alert for 'row deleted' events with default template", () => {
        openDatabaseTable();

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
          cy.findByText("Delete").click();
          cy.document().findByText("Delete 1 record").click();
          cy.wait("@deleteRecord");
        });

        cy.log("Testing default email template");

        H.checkEmailContent(
          `A record was deleted from "${TABLE_NAME}" by ${ADMIN_NAME}`,
          [`A record was deleted in Table ${TABLE_NAME}`],
        );
      });

      it("should trigger an alert for 'row deleted' events with custom template", () => {
        const CUSTOM_SUBJECT = "My custom subject for {{table.name}}";
        const CUSTOM_BODY = "{{#each record}} {{@key}}: {{@value}} {{/each}}";

        openDatabaseTable();

        cy.findByTestId("table-notifications-trigger").click();

        createNotificationWithCustomTemplate(
          /when records are deleted/i,
          CUSTOM_SUBJECT,
          CUSTOM_BODY,
        ).then((interception) => {
          verifyNotificationTemplateResponse(
            interception,
            CUSTOM_SUBJECT,
            CUSTOM_BODY,
          );
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
          cy.findByText("Delete").click();
          cy.document().findByText("Delete 1 record").click();
          cy.wait("@deleteRecord");
        });

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
      });

      openDatabaseTable();

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

  describe("Delete an existing alert", () => {
    it("should delete an existing alert", () => {
      H.getTableId({
        name: TABLE_NAME,
      }).then((tableId) => {
        setupAlert(tableId, "event/row.created");
      });

      openDatabaseTable();

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

  describe("Template preview", () => {
    it("should display default template preview", () => {
      openDatabaseTable();

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
      openDatabaseTable();

      cy.findByTestId("table-notifications-trigger").click();

      cy.findByTestId("table-notification-create").within(() => {
        cy.findByTestId("notification-event-select").click();
        cy.document()
          .findByRole("option", {
            name: /when new records are created/i,
          })
          .click();

        fillInCustomTemplate(
          "My custom subject for {{table.name}}",
          "{{#each record}} {{@key}}: {{@value}} {{/each}}",
        );

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

    it("should display error message if template is incorrect", () => {
      openDatabaseTable();

      cy.findByTestId("table-notifications-trigger").click();

      cy.findByTestId("table-notification-create").within(() => {
        cy.findByTestId("notification-event-select").click();
        cy.document()
          .findByRole("option", {
            name: /when new records are created/i,
          })
          .click();

        fillInCustomTemplate(
          "My custom subject for {{table.name}}",
          "{{/each}}",
        );

        cy.intercept("POST", "/api/notification/preview_template").as(
          "previewTemplate",
        );

        cy.findByLabelText("Show preview").click();

        cy.wait("@previewTemplate");
        cy.findByTestId("preview-template-panel").should("be.visible");
        cy.findByTestId("preview-template-panel").within(() => {
          cy.root().should("not.contain", "My custom subject for");
          cy.root().should("contain", "Failed to render template");
          cy.root().contains(/found:.*expected:/);
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
