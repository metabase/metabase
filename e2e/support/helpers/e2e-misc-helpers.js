import { pickEntity } from "./e2e-collection-helpers";
import { modal, undoToast } from "./e2e-ui-elements-helpers";

// Find a text field by label text, type it in, then blur the field.
// Commonly used in our Admin section as we auto-save settings.
export function typeAndBlurUsingLabel(label, value) {
  cy.findByLabelText(label).clear().type(value).blur();
}

export function visitAlias(alias) {
  cy.get(alias).then((url) => {
    cy.visit(url);
  });
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

export function runButtonOverlay() {
  return cy.findByTestId("run-button-overlay");
}

export function runButtonInOverlay() {
  return runButtonOverlay().findByTestId("run-button");
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
  const promise = new Promise((resolve) => {
    state.resolve = resolve;
  });
  cy.intercept(method, path, (req) => {
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
 *   H.createQuestionAndAddToDashboard(firstQuery, 1),
 *   H.createQuestionAndAddToDashboard(secondQuery, 1),
 * ]).then(() => {
 *   cy.visit(`/dashboard/1`);
 * });
 */
const cypressWaitAllRecursive = (results, commands) => {
  const [nextCommand, ...restCommands] = commands;
  if (!nextCommand) {
    return;
  }

  return nextCommand.then((result) => {
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
    return visitQuestionById(questionIdOrAlias);
  }

  if (typeof questionIdOrAlias === "string") {
    return cy.get(questionIdOrAlias).then((id) => visitQuestionById(id));
  }
}

function visitQuestionById(id) {
  // In case we use this function multiple times in a test, make sure aliases are unique for each question
  const alias = "cardQuery" + id;
  const metadataAlias = `${alias}-queryMetadata`;

  // We need to use the wildcard because endpoint for pivot tables has the following format: `/api/card/pivot/${id}/query`
  cy.intercept("POST", `/api/card/**/${id}/query`).as(alias);
  cy.intercept("GET", `/api/card/**/${id}/query_metadata`).as(metadataAlias);

  cy.visit(`/question/${id}`);

  cy.wait("@" + metadataAlias);
  cy.wait("@" + alias);

  return cy.wrap(id);
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
    cy.get(dashboardIdOrAlias).then((id) => visitDashboardById(id, { params }));
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
        (card) => card.dashboard_tab_id === firstTab.id,
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

  const isAlreadyDefined = aliases.find((a) => a === alias);

  if (!isAlreadyDefined) {
    cy.intercept(method, url).as(alias);
  }
}

/**
 *
 * @param {string=} name
 * @param {Object=} options
 * @param {boolean=} [options.addToDashboard]
 * @param {boolean=} [options.wrapId]
 * @param {string=} [options.idAlias]
 * @param {Object=} [pickEntityOptions]
 */
export function saveQuestion(
  name,
  {
    addToDashboard = false,
    wrapId = false,
    idAlias = "questionId",
    shouldReplaceOriginalQuestion = false,
    shouldSaveAsNewQuestion = false,
  } = {},
  pickEntityOptions = null,
) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button("Save").click();
  if (shouldReplaceOriginalQuestion) {
    modal().within(() => {
      cy.log("Ensure that 'Replace original question' is checked");
      cy.findByLabelText(/Replace original question/i).should("be.checked");
      cy.button("Save").click();
    });
  }
  if (shouldSaveAsNewQuestion) {
    modal().within(() => {
      cy.log("Select 'Save as new question'");
      cy.findByLabelText(/Save as new question/i).click();
    });
  }

  cy.findByTestId("save-question-modal").within(() => {
    if (name) {
      cy.findByLabelText("Name").clear().type(name);
    }

    if (pickEntityOptions) {
      cy.findByLabelText(/Where do you want to save this/).click();
    }
  });

  if (pickEntityOptions) {
    pickEntity({ ...pickEntityOptions, select: true });
  }

  cy.findByTestId("save-question-modal").button("Save").click();

  cy.wait("@saveQuestion").then(({ response: { body } }) => {
    if (wrapId) {
      cy.wrap(body.id).as(idAlias);
    }

    // if this question is saved to a dashboard
    // we don't need to worry about the add to dash modal
    const wasSavedToCollection = !body.dashboard_id;

    if (wasSavedToCollection) {
      checkSavedToCollectionQuestionToast(addToDashboard);
    }
  });
}

export function checkSavedToCollectionQuestionToast(addToDashboard) {
  undoToast().within(() => {
    cy.findByText(/Saved/i).should("be.visible");

    if (addToDashboard) {
      cy.button(/Add this to a dashboard/i).click();
    }
  });
}

export function saveQuestionToCollection(
  name,
  pickEntityOptions = { path: ["Our analytics"] },
  reqInfo,
) {
  saveQuestion(name, reqInfo, pickEntityOptions);
}

export function saveSavedQuestion() {
  cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  cy.findByText("Save").click();

  cy.findByTestId("save-question-modal").within((modal) => {
    cy.findByText("Save").click();
  });
  cy.wait("@updateQuestion");
}

/**
 *
 * @param {number} id
 * @param {object} options
 * @param {Record<string, string>} options.params
 * @param {Record<string, string>} options.hash
 */
export function visitPublicQuestion(id, { params = {}, hash = {} } = {}) {
  const searchParams = new URLSearchParams(params).toString();
  const searchSection = searchParams ? `?${searchParams}` : "";
  const hashParams = new URLSearchParams(hash).toString();
  const hashSection = hashParams ? `#${hashParams}` : "";

  cy.request("POST", `/api/card/${id}/public_link`).then(
    ({ body: { uuid } }) => {
      cy.signOut();
      cy.visit({
        url: `/public/question/${uuid}` + searchSection + hashSection,
      });
    },
  );
}

/**
 *
 * @param {number} id
 * @param {object} options
 * @param {Record<string, string>} options.params
 * @param {Record<string, string>} options.hash
 * @param {(window: Window) => void} [options.onBeforeLoad]
 */
export function visitPublicDashboard(
  id,
  { params = {}, hash = {}, onBeforeLoad } = {},
) {
  const searchParams = new URLSearchParams(params).toString();
  const searchSection = searchParams ? `?${searchParams}` : "";
  const hashParams = new URLSearchParams(hash).toString();
  const hashSection = hashParams ? `#${hashParams}` : "";

  cy.request("POST", `/api/dashboard/${id}/public_link`).then(
    ({ body: { uuid } }) => {
      cy.signOut();
      cy.visit({
        url: `/public/dashboard/${uuid}` + searchSection + hashSection,
        onBeforeLoad,
      });
    },
  );
}

export const goToAuthOverviewPage = () => {
  cy.findByTestId("admin-layout-sidebar")
    .findByText("Overview") // auth overview page
    .click();
};

/**
 * This function exists to work around custom dynamic anchor creation.
 * @see https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dom.js#L301-L312
 *
 * WARNING: For the assertions to work, ensure that a click event occurs on an anchor element afterwards.
 */
export const onNextAnchorClick = (callback) => {
  cy.window().then((window) => {
    const originalClick = window.HTMLAnchorElement.prototype.click;

    window.HTMLAnchorElement.prototype.click = function () {
      callback(this);
      window.HTMLAnchorElement.prototype.click = originalClick;
    };
  });
};
