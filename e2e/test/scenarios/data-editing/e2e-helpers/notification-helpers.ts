// Using type import to avoid runtime dependency on cypress types
type Interception = {
  response?: {
    statusCode?: number;
    body?: {
      handlers?: Array<{
        template?: Record<string, unknown>;
      }>;
    };
  };
};

/**
 * Fills in the custom template fields with the provided subject and body
 * @param subject The subject template to use
 * @param body The body template to use
 */
export const fillInCustomTemplate = (subject: string, body: string) => {
  cy.findByTestId("email-template-subject")
    .find(".cm-content")
    .then(([contentElement]) => {
      const cm = contentElement.cmView?.view;
      if (cm) {
        cm.contentDOM.focus();
        cm.dispatch({
          changes: {
            from: 0,
            to: cm.state.doc.length,
            insert: subject,
          },
        });
        cm.contentDOM.blur();
      }

      cy.wait(200);

      cy.document()
        .findByTestId("email-template-body")
        .find(".cm-content")
        .then(([contentElement]) => {
          const cm = contentElement.cmView?.view;
          if (cm) {
            cm.contentDOM.focus();
            cm.dispatch({
              changes: {
                from: 0,
                to: cm.state.doc.length,
                insert: body,
              },
            });
            cm.contentDOM.blur();
          }
        });
    });
};

/**
 * Verifies that the notification was created with the expected custom template
 * @param response The intercepted response from the notification creation request
 * @param expectedSubject The expected subject template
 * @param expectedBody The expected body template
 */
export const verifyNotificationTemplate = (
  response: Interception,
  expectedSubject: string,
  expectedBody: string,
) => {
  expect(response?.response?.statusCode).to.equal(200);
  const stringifiedTemplate = JSON.stringify(
    response?.response?.body?.handlers?.[0]?.template,
  );
  expect(stringifiedTemplate).to.contain(expectedSubject);
  expect(stringifiedTemplate).to.contain(expectedBody);
};

/**
 * Creates a notification with a custom template
 * @param eventName The name of the event to select (e.g., "when new records are created")
 * @param subject The subject template to use
 * @param body The body template to use
 */
export const createNotificationWithCustomTemplate = (
  eventName: string | RegExp,
  subject: string,
  body: string,
) => {
  // Open the notification creation modal
  cy.findByTestId("table-notification-create").within(() => {
    // Select the event type
    cy.findByTestId("notification-event-select").click();
    cy.document()
      .findByRole("option", {
        name: eventName,
      })
      .click();

    // Fill in the custom templates
    fillInCustomTemplate(subject, body);

    // Submit the form
    cy.findByRole("button", { name: "Done" }).click();
  });

  // Wait for the notification to be created and return the response
  return cy.wait("@createNotification");
};
