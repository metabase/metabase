import "./commands/ui/button";
import "./commands/ui/icon";

import "./commands/user/createUser";
import "./commands/user/authentication";

import "./commands/permissions/updatePermissions";
import "./commands/permissions/sandboxTable";

import "./commands/overwrites/log";

Cypress.Commands.add("createDashboard", name => {
  cy.log(`Create a dashboard: ${name}`);
  cy.request("POST", "/api/dashboard", { name });
});

Cypress.Commands.add(
  "createQuestion",
  ({
    name = "card",
    query = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "query",
        query,
        database,
      },
      display,
      visualization_settings,
    });
  },
);

Cypress.Commands.add(
  "createNativeQuestion",
  ({
    name = "native",
    native = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a native question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "native",
        native,
        database,
      },
      display,
      visualization_settings,
    });
  },
);

Cypress.Commands.add(
  "isVisibleInPopover",
  {
    prevSubject: true,
  },
  subject => {
    cy.wrap(subject)
      .closest(".PopoverContainer.PopoverContainer--open")
      .then($popover => {
        /**
         * Helper function that:
         *  1. Obtains the value of element's computed property, but it always returns it in px (for example: "12px")
         *  2. Returns that value as a floating point number (strips away the "px") which enables us to use it in later calculations
         */
        function getElementPropertyValue(property) {
          const propertyValue = window
            .getComputedStyle(subject[0], null)
            .getPropertyValue(property); /* [1] */

          return parseFloat(propertyValue); /* [2] */
        }

        const elementRect = subject[0].getBoundingClientRect();
        // We need to account for padding and borders to get the real height of an element because we're using `box-sizing: border-box`
        const PT = getElementPropertyValue("padding-top");
        const PB = getElementPropertyValue("padding-bottom");
        const BT = getElementPropertyValue("border-top");
        const BB = getElementPropertyValue("border-bottom");

        const elementTop = elementRect.top + PT + BT;
        const elementBottom = elementRect.bottom - PB - BB;

        const popoverRect = $popover[0].getBoundingClientRect();
        // We need the outermost dimensions for the container - no need to account for padding and borders
        const popoverTop = popoverRect.top;
        const popoverBottom = popoverRect.bottom;

        expect(elementTop).to.be.greaterThan(popoverTop);
        expect(elementBottom).to.be.greaterThan(popoverTop);
        expect(elementTop).not.to.be.greaterThan(popoverBottom);
        expect(elementBottom).not.to.be.greaterThan(popoverBottom);
      });
  },
);

Cypress.Commands.add(
  "isInViewport",
  {
    prevSubject: true,
  },
  subject => {
    const viewportTop = 0;
    const viewportBottom = Cypress.$(cy.state("window")).height();
    const element = subject[0].getBoundingClientRect();

    expect(element.top).to.be.greaterThan(viewportTop);
    expect(element.bottom).to.be.greaterThan(viewportTop);
    expect(element.top).not.to.be.greaterThan(viewportBottom);
    expect(element.bottom).not.to.be.greaterThan(viewportBottom);
  },
);

/**
 * DATABASES
 */

Cypress.Commands.add(
  "addH2SampleDataset",
  ({ name, auto_run_queries = false, is_full_sync = false } = {}) => {
    cy.log(`Add another H2 sample dataset DB called "${name}"`);
    cy.request("POST", "/api/database", {
      engine: "h2",
      name,
      details: {
        db:
          "zip:./target/uberjar/metabase.jar!/sample-dataset.db;USER=GUEST;PASSWORD=guest",
      },
      auto_run_queries,
      is_full_sync,
      schedules: {},
    });
  },
);
