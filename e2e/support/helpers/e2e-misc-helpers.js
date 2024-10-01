// Find a text field by label text, type it in, then blur the field.
// Commonly used in our Admin section as we auto-save settings.
export function typeAndBlurUsingLabel(label, value) {
  cy.findByLabelText(label).clear().type(value).blur();
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
  newMenuItemTitle = "SQL query",
} = {}) {
  if (!fromCurrentPage) {
    cy.visit("/");
  }
  cy.findByText("New").click();
  cy.findByText(newMenuItemTitle).click();

  databaseName && cy.findByText(databaseName).click();

  // We are first loading databases to see if we should show the
  // database selector or simply display the previously selected database
  cy.findAllByTestId("loading-indicator").should("not.exist");

  return focusNativeEditor().as(alias);
}

export function focusNativeEditor() {
  cy.findByTestId("native-query-editor")
    .should("be.visible")
    .should("have.class", "ace_editor")
    .click();

  return cy
    .findByTestId("native-query-editor")
    .should("have.class", "ace_focus");
}

/**
 * Executes native query and waits for the results to load.
 * Makes sure that the question is not "dirty" after the query successfully ran.
 */
export function runNativeQuery({ wait = true } = {}) {
  cy.intercept("POST", "api/dataset").as("dataset");
  cy.findByTestId("native-query-editor-container").icon("play").click();

  if (wait) {
    cy.wait("@dataset");
  }

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

/**
 * Executes and waits for all Cypress commands sequentially.
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
const cypressWaitAllRecursive = (results, commands) => {
  const [nextCommand, ...restCommands] = commands;
  if (!nextCommand) {
    return;
  }

  return nextCommand.then(result => {
    results.push(result);

    if (nextCommand == null) {
      return;
    }

    return cypressWaitAllRecursive(results, restCommands);
  });
};

export const cypressWaitAll = function (commands) {
  const results = [];

  return cy.wrap(results).then(() => {
    cypressWaitAllRecursive(results, commands);
  });
};

/**
 * Visit a question and wait for its query to load.
 *
 * @param {number|string} questionIdOrAlias
 */
export function visitQuestion(questionIdOrAlias) {
  if (typeof questionIdOrAlias === "number") {
    visitQuestionById(questionIdOrAlias);
  }

  if (typeof questionIdOrAlias === "string") {
    cy.get(questionIdOrAlias).then(id => visitQuestionById(id));
  }
}

function visitQuestionById(id) {
  // In case we use this function multiple times in a test, make sure aliases are unique for each question
  const alias = "cardQuery" + id;

  // We need to use the wildcard because endpoint for pivot tables has the following format: `/api/card/pivot/${id}/query`
  cy.intercept("POST", `/api/card/**/${id}/query`).as(alias);

  cy.visit(`/question/${id}`);

  cy.wait("@" + alias);
}

/**
 * Visit a model and wait for its query to load.
 *
 * @param {number} id
 */
export function visitModel(id, { hasDataAccess = true } = {}) {
  const alias = "modelQuery" + id;

  if (hasDataAccess) {
    cy.intercept("POST", "/api/dataset").as(alias);
  } else {
    cy.intercept("POST", `/api/card/**/${id}/query`).as(alias);
  }

  cy.visit(`/model/${id}`);

  cy.wait("@" + alias);
}

/**
 * Visit a metric and wait for its query to load.
 *
 * @param {number} id
 */
export function visitMetric(id, { hasDataAccess = true } = {}) {
  const alias = "metricQuery" + id;

  if (hasDataAccess) {
    cy.intercept("POST", "/api/dataset").as(alias);
  } else {
    cy.intercept("POST", `/api/card/**/${id}/query`).as(alias);
  }

  cy.visit(`/metric/${id}`);

  cy.wait("@" + alias);
}

/**
 * Visit a dashboard and wait for the related queries to load.
 *
 * @param {number|string} dashboardIdOrAlias
 * @param {Object} config
 */
export function visitDashboard(dashboardIdOrAlias, { params = {} } = {}) {
  if (typeof dashboardIdOrAlias === "number") {
    visitDashboardById(dashboardIdOrAlias, { params });
  }

  if (typeof dashboardIdOrAlias === "string") {
    cy.get(dashboardIdOrAlias).then(id => visitDashboardById(id, { params }));
  }
}

function visitDashboardById(dashboard_id, config) {
  // Some users will not have permissions for this request
  cy.request({
    method: "GET",
    url: `/api/dashboard/${dashboard_id}`,
    // That's why we have to ignore failures
    failOnStatusCode: false,
  }).then(({ status, body: { dashcards, tabs } }) => {
    const dashboardAlias = "getDashboard" + dashboard_id;

    cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as(dashboardAlias);

    const canViewDashboard = hasAccess(status);

    let validQuestions = dashboardHasQuestions(dashcards);

    // if dashboard has tabs, only expect cards on the first tab
    if (tabs?.length > 0 && validQuestions) {
      const firstTab = tabs[0];
      validQuestions = validQuestions.filter(
        card => card.dashboard_tab_id === firstTab.id,
      );
    }

    if (canViewDashboard && validQuestions) {
      // If dashboard has valid questions (GUI or native),
      // we need to alias each request and wait for their reponses
      const aliases = validQuestions.map(
        ({ id, card_id, card: { display } }) => {
          const baseUrl =
            display === "pivot"
              ? `/api/dashboard/pivot/${dashboard_id}`
              : `/api/dashboard/${dashboard_id}`;

          const interceptUrl = `${baseUrl}/dashcard/${id}/card/${card_id}/query`;

          const alias = "dashcardQuery" + id;

          cy.intercept("POST", interceptUrl).as(alias);

          return `@${alias}`;
        },
      );

      cy.visit({
        url: `/dashboard/${dashboard_id}`,
        qs: config.params,
      });

      cy.wait(aliases);
    } else {
      // For a dashboard:
      //  - without questions (can be empty or markdown only) or
      //  - the one which user doesn't have access to
      // the last request will always be `GET /api/dashboard/:dashboard_id`
      cy.visit(`/dashboard/${dashboard_id}`);

      cy.wait(`@${dashboardAlias}`);
    }
  });
}

function hasAccess(statusCode) {
  return statusCode !== 403;
}

function dashboardHasQuestions(cards) {
  if (Array.isArray(cards) && cards.length > 0) {
    const questions = cards
      // Filter out markdown cards
      .filter(({ card_id }) => {
        return card_id !== null;
      })
      // Filter out cards which the current user is not allowed to see
      .filter(({ card }) => {
        return card.dataset_query !== undefined;
      });

    const isPopulated = questions.length > 0;

    return isPopulated && questions;
  } else {
    return false;
  }
}

export function interceptIfNotPreviouslyDefined({ method, url, alias } = {}) {
  const aliases = Object.keys(cy.state("aliases") ?? {});

  const isAlreadyDefined = aliases.find(a => a === alias);

  if (!isAlreadyDefined) {
    cy.intercept(method, url).as(alias);
  }
}

export function saveQuestion(
  name,
  { wrapId = false, idAlias = "questionId" } = {},
) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button("Save").click();

  let wasSavedToDashboard = false;

  cy.findByTestId("save-question-modal").within(modal => {
    if (name) {
      cy.findByLabelText("Name").clear().type(name);
    }

    // detect if was saved to dashboard
    cy.icon("dashboard").then(el => {
      console.log(el);
      wasSavedToDashboard = el.length > 0;
    });

    cy.findByText("Save").click();
  });

  cy.wait("@saveQuestion").then(({ response: { body } }) => {
    if (wrapId) {
      cy.wrap(body.id).as(idAlias);
    }
  });

  if (wasSavedToDashboard) {
    cy.get("#QuestionSavedModal").within(() => {
      cy.findByText(/add this to a dashboard/i);
      cy.findByText("Not now").click();
    });
  }
}

export function saveSavedQuestion() {
  cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  cy.findByText("Save").click();

  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
  cy.wait("@updateQuestion");
}

export function visitPublicQuestion(id) {
  cy.request("POST", `/api/card/${id}/public_link`).then(
    ({ body: { uuid } }) => {
      cy.signOut();
      cy.visit(`/public/question/${uuid}`);
    },
  );
}

export function visitPublicDashboard(id, { params = {} } = {}) {
  cy.request("POST", `/api/dashboard/${id}/public_link`).then(
    ({ body: { uuid } }) => {
      cy.signOut();
      cy.visit({
        url: `/public/dashboard/${uuid}`,
        qs: params,
      });
    },
  );
}
