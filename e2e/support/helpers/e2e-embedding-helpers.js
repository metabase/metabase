import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";

const jwtSignLocation = "e2e/support/external/e2e-jwt-sign.js";

/**
 * Programatically generate token and visit the embedded page for question or dashboard
 *
 * @param {object} payload
 * @param {{setFilters: string, hideFilters:string}}
 *
 * @example
 * visitEmbeddedPage(payload, {
 *   // We divide filter values with an ampersand
 *   setFilters: "id=92&source=Organic",
 *   // We divide multiple hidden filters with coma.
 *   // Make sure there are no spaces in between!
 *   hideFilters: "created_at,state"
 * });
 */
export function visitEmbeddedPage(
  payload,
  { setFilters = "", hideFilters = "" } = {},
) {
  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };

  const stringifiedPayload = JSON.stringify(payloadWithExpiration);

  const embeddableObject = getEmbeddableObject(payload);

  const urlRoot = `/embed/${embeddableObject}/`;
  const filters = getFilterValues(setFilters);
  const hiddenFilters = getHiddenFilters(hideFilters);
  // Style is hard coded for now because we're not concerned with testing its properties
  const style = "#bordered=true&titled=true";

  cy.exec(
    `node  ${jwtSignLocation} '${stringifiedPayload}' ${METABASE_SECRET_KEY}`,
  ).then(({ stdout: token }) => {
    const embeddableUrl = urlRoot + token + filters + style + hiddenFilters;

    // Always visit embedded page logged out
    cy.signOut();

    cy.visit(embeddableUrl);
  });
}

/**
 * Construct the string that sets value to certain filters
 *
 * @param {string} filters
 * @returns string
 */
function getFilterValues(filters) {
  return filters && "?" + filters;
}

/**
 * Construct the string that hides certain filters
 *
 * @param {string} filters
 * @returns string
 */
function getHiddenFilters(filters) {
  return filters && "&hide_parameters=" + filters;
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
