import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";

/**
 * Programatically generate token and visit the embedded page for a question or a dashboard
 *
 * @param {object} payload
 * @param {{setFilters: object, setStyle: object, hideFilters: string[]}}
 *
 * @example
 * visitEmbeddedPage(payload, {
 *   setFilters: {id: 92, source: "Organic"},
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
   * Construct the string that hides certain filters
   *
   * @param {string[]} filters
   * @returns object
   */
  function getHiddenFilters(filters) {
    return filters.length > 0 ? { hide_parameters: filters.join(",") } : {};
  }

  /**
   *
   * @param {object} pageStyle
   * @param {object} hiddenFilters
   *
   * @returns string
   */
  function getHash(pageStyle, hiddenFilters) {
    return new URLSearchParams({ ...pageStyle, ...hiddenFilters }).toString();
  }

  /**
   * Extract the embeddable object type from the payload
   *
   * @param {object} payload
   * @returns ("question"|"dashboard")
   */
  function getEmbeddableObject(payload) {
    return Object.keys(payload.resource)[0];
  }
}

/**
 * Grab iframe `src` via UI and open it,
 * but make sure user is signed out.
 */
export function visitIframe() {
  cy.document().then(doc => {
    const iframe = doc.querySelector("iframe");

    cy.signOut();
    cy.visit(iframe.src);
  });
}
