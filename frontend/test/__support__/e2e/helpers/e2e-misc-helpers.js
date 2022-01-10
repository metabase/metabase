// Find a text field by label text, type it in, then blur the field.
// Commonly used in our Admin section as we auto-save settings.
export function typeAndBlurUsingLabel(label, value) {
  cy.findByLabelText(label)
    .clear()
    .type(value)
    .blur();
}

export function visitAlias(alias) {
  cy.get(alias).then(url => {
    cy.visit(url);
  });
}

/**
 * Open native (SQL) editor and alias it.
 *
 * @param {object} options
 * @param {string} [options.databaseName] - If there is more than one database, select the desired one by its name.
 * @param {string} [options.alias="editor"] - The alias that can be used later in the test as `cy.get("@" + alias)`.
 * @example
 * openNativeEditor().type("SELECT 123");
 * @example
 * openNativeEditor({ databaseName: "QA Postgres12" }).type("SELECT 123");
 */
export function openNativeEditor({
  databaseName,
  alias = "editor",
  fromCurrentPage,
} = {}) {
  if (!fromCurrentPage) {
    cy.visit("/");
  }
  cy.findByText("Create").click();
  cy.findByText("SQL query").click();

  databaseName && cy.findByText(databaseName).click();

  return cy
    .get(".ace_content")
    .as(alias)
    .should("be.visible");
}

/**
 * Open notebook editor.
 *
 * @param {object} options
 * @param {boolean} [options.fromCurrentPage] - Open notebook editor from current location
 * @example
 * openNotebookEditor({ fromCurrentPage: true })
 */
export function openNotebookEditor({ fromCurrentPage } = {}) {
  if (!fromCurrentPage) {
    cy.visit("/");
  }

  cy.findByText("Create").click();
  cy.findByText("Visual question").click();
}

/**
 * Executes native query and waits for the results to load.
 * Makes sure that the question is not "dirty" after the query successfully ran.
 * @param {string} [xhrAlias ="dataset"]
 */
export function runNativeQuery(xhrAlias = "dataset") {
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.wait("@" + xhrAlias);
  cy.icon("play").should("not.exist");
}

/**
 * Intercepts a request and returns resolve function that allows
 * the request to continue
 *
 * @param {string} method - Request method ("GET", "POST", etc)
 * @param {string} path - Request URL to intercept
 * @example
 * const req = interceptPromise("GET", "/dashboard/1");
 * // ... do something before request is allowed to go through ...
 * req.resolve();
 */
export function interceptPromise(method, path) {
  const state = {};
  const promise = new Promise(resolve => {
    state.resolve = resolve;
  });
  cy.intercept(method, path, req => {
    return promise.then(() => {
      req.continue();
    });
  });
  return state;
}

const chainStart = Symbol();

/**
 * Waits for all Cypress commands similarly to Promise.all.
 * Helps to avoid excessive nesting and verbosity
 *
 * @param {Array.<Cypress.Chainable<any>>} commands - Cypress commands
 * @example
 * cypressWaitAll([
 *   cy.createQuestionAndAddToDashboard(firstQuery, 1),
 *   cy.createQuestionAndAddToDashboard(secondQuery, 1),
 * ]).then(() => {
 *   cy.visit(`/dashboard/1`);
 * });
 */
export const cypressWaitAll = function(commands) {
  const _ = Cypress._;
  const chain = cy.wrap(null, { log: false });

  const stopCommand = _.find(cy.queue.commands, {
    attributes: { chainerId: chain.chainerId },
  });

  const startCommand = _.find(cy.queue.commands, {
    attributes: { chainerId: commands[0].chainerId },
  });

  const p = chain.then(() => {
    return _(commands)
      .map(cmd => {
        return cmd[chainStart]
          ? cmd[chainStart].attributes
          : _.find(cy.queue.commands, {
              attributes: { chainerId: cmd.chainerId },
            }).attributes;
      })
      .concat(stopCommand.attributes)
      .slice(1)
      .flatMap(cmd => {
        return cmd.prev.get("subject");
      })
      .value();
  });

  p[chainStart] = startCommand;

  return p;
};
