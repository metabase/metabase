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

export const verifyNotificationTemplateResponse = (
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

export const createNotificationWithCustomTemplate = (
  eventName: string | RegExp,
  subject: string,
  body: string,
) => {
  cy.findByTestId("table-notification-create").within(() => {
    cy.findByTestId("notification-event-select").click();
    cy.document()
      .findByRole("option", {
        name: eventName,
      })
      .click();

    fillInCustomTemplate(subject, body);

    cy.findByRole("button", { name: "Done" }).click();
  });

  // Wait for the notification to be created and return the response
  return cy.wait("@createNotification");
};
