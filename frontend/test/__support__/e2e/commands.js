import { USERS } from "__support__/e2e/cypress_data";

Cypress.Commands.add("createUser", user => {
  cy.log(`Create ${user} user`);
  return cy.request("POST", "/api/user", USERS[user]).then(({ body }) => {
    // Dismiss `it's ok to play around` modal for the created user
    cy.request("PUT", `/api/user/${body.id}/qbnewb`, {});
  });
});

Cypress.Commands.add("signIn", (user = "admin") => {
  const { email: username, password } = USERS[user];
  cy.log(`Logging in as ${user}`);
  cy.request("POST", "/api/session", { username, password });
});

Cypress.Commands.add("signInAsAdmin", () => {
  cy.signIn("admin");
});

Cypress.Commands.add("signInAsNormalUser", () => {
  cy.signIn("normal");
});

Cypress.Commands.add("signInAsSandboxedUser", () => {
  cy.signIn("sandboxed");
});

Cypress.Commands.add("signOut", () => {
  cy.log("Signing out");
  cy.clearCookie("metabase.SESSION");
});

Cypress.Commands.add("icon", icon_name => {
  cy.get(`.Icon-${icon_name}`);
});

Cypress.Commands.add("button", button_name => {
  cy.findByRole("button", { name: button_name });
});

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

/**
 * PERMISSIONS
 *
 * As per definition for `PUT /graph` from `permissions.clj`:
 *
 * "This should return the same graph, in the same format,
 * that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary.
 * This modified graph must correspond to the `PermissionsGraph` schema."
 *
 * That's why we must chain GET and PUT requests one after the other.
 */

Cypress.Commands.add(
  "updatePermissionsGraph",
  (groupsPermissionsObject = {}) => {
    if (typeof groupsPermissionsObject !== "object") {
      throw new Error("`groupsPermissionsObject` must be an object!");
    }

    cy.log("Fetch permissions graph");
    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsPermissionsObject);

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
  },
);

Cypress.Commands.add(
  "updatePermissionsSchemas",
  ({ schemas = {}, user_group = 4, database_id = 1 } = {}) => {
    if (typeof schemas !== "object") {
      throw new Error("`schemas` must be an object!");
    }

    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, {
          [user_group]: {
            [database_id]: {
              schemas,
            },
          },
        });

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
  },
);

Cypress.Commands.add("updateCollectionGraph", (groupsCollectionObject = {}) => {
  if (typeof groupsCollectionObject !== "object") {
    throw new Error("`groupsCollectionObject` must be an object!");
  }

  cy.log("Fetch permissions graph");
  cy.request("GET", "/api/collection/graph").then(
    ({ body: { groups, revision } }) => {
      const UPDATED_GROUPS = Object.assign(groups, groupsCollectionObject);

      cy.log("Update/save permissions");
      cy.request("PUT", "/api/collection/graph", {
        groups: UPDATED_GROUPS,
        revision,
      });
    },
  );
});

Cypress.Commands.add(
  "sandboxTable",
  ({
    attribute_remappings = {},
    card_id = null,
    group_id = 4,
    table_id = 2,
  } = {}) => {
    // Extract the name of the table, as well as `schema` and `db_id` that we'll need later on for `cy.updatePermissionsSchemas()`
    cy.request("GET", "/api/table").then(({ body: tables }) => {
      const { name, schema, db_id } = tables.find(
        table => table.id === table_id,
      );
      const attr = Object.keys(attribute_remappings).join(", "); // Account for the possiblity of passing multiple user attributes

      cy.log(`Sandbox "${name}" table on "${attr}"`);
      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings,
        card_id,
        group_id,
        table_id,
      });

      cy.updatePermissionsSchemas({
        schemas: {
          [schema]: {
            [table_id]: { query: "segmented", read: "all" },
          },
        },
        user_group: group_id,
        database_id: db_id,
      });
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

/**
 * OVERWRITES
 */

Cypress.Commands.overwrite("log", (originalFn, message) => {
  Cypress.log({
    displayName: `--- ${window.logCalls}. ${message} ---`,
    name: `--- ${window.logCalls}. ${message} ---`,
    message: "",
  });

  window.logCalls++;
});

// We want to reset the log counter for every new test (do not remove from this file)
beforeEach(() => {
  window.logCalls = 1;
});
