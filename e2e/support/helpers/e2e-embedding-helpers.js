import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";

/**
 * @typedef {object} QuestionResource
 * @property {number} question - ID of a question we are embedding
 *
 * @typedef {object} DashboardResource
 * @property {number} dashboard - ID of a dashboard we are embedding
 *
 * @typedef {object} EmbedPayload
 * @property {(QuestionResource|DashboardResource)} resource
 * {@link QuestionResource} or {@link DashboardResource}
 * @property {object} params
 *
 * @typedef {object} HiddenFilters
 * @property {string} hide_parameters
 *
 * @typedef {object} PageStyle
 * @property {boolean} bordered
 * @property {boolean} titled
 * @property {boolean} hide_download_button - EE/PRO only feature to disable downloads
 */

/**
 * Programmatically generate token and visit the embedded page for a question or a dashboard
 *
 * @param {EmbedPayload} payload - The {@link EmbedPayload} we pass to this function
 * @param {{setFilters: object, pageStyle: PageStyle, hideFilters: string[]}} options
 *
 * @example
 * visitEmbeddedPage(payload, {
 *   setFilters: {id: 92, source: "Organic"},
 *   pageStyle: {titled: true},
 *   hideFilters: ["id", "source"]
 * });
 */
export function visitEmbeddedPage(
  payload,
  { setFilters = {}, hideFilters = [], pageStyle = {} } = {},
) {
  const jwtSignLocation = "e2e/support/external/e2e-jwt-sign.js";

  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };

  const stringifiedPayload = JSON.stringify(payloadWithExpiration);
  const signTransaction = `node  ${jwtSignLocation} '${stringifiedPayload}' ${METABASE_SECRET_KEY}`;

  cy.exec(signTransaction).then(({ stdout: tokenizedQuery }) => {
    const embeddableObject = getEmbeddableObject(payload);
    const hiddenFilters = getHiddenFilters(hideFilters);
    const urlRoot = `/embed/${embeddableObject}/${tokenizedQuery}`;
    const urlHash = getHash(pageStyle, hiddenFilters);

    // Always visit embedded page logged out
    cy.signOut();

    cy.visit({
      url: urlRoot,
      qs: setFilters,
      onBeforeLoad: window => {
        if (urlHash) {
          window.location.hash = urlHash;
        }
      },
    });
  });

  /**
   * Construct a hidden filters object from the list of filters we want to hide
   *
   * @param {string[]} filters
   * @returns {HiddenFilters}
   */
  function getHiddenFilters(filters) {
    const params = filters.join(",");
    return filters.length > 0 ? { hide_parameters: params } : {};
  }

  /**
   * Get the URL hash from the page style and/or hidden filters parameters
   *
   * @param {PageStyle} pageStyle
   * @param {HiddenFilters} hiddenFilters
   *
   * @returns string
   */
  function getHash(pageStyle, hiddenFilters) {
    return new URLSearchParams({ ...pageStyle, ...hiddenFilters }).toString();
  }

  /**
   * Extract the embeddable object type from the payload
   *
   * @param {EmbedPayload} payload - See {@link EmbedPayload}
   * @returns ("question"|"dashboard")
   */
  function getEmbeddableObject(payload) {
    return Object.keys(payload.resource)[0];
  }
}

/**
 * Grab an iframe `src` via UI and open it,
 * but make sure user is signed out.
 */
export function visitIframe() {
  cy.document().then(doc => {
    const iframe = doc.querySelector("iframe");

    cy.signOut();
    cy.visit(iframe.src);
  });
}

/**
 * Get page iframe body wrapped in `cy` helper
 * @param {string} [selector]
 */
export function getIframeBody(selector = "iframe") {
  return cy
    .get(selector)
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.null")
    .then(cy.wrap);
}
