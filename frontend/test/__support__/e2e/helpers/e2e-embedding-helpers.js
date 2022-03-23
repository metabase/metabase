import { METABASE_SECRET_KEY } from "__support__/e2e/cypress_data";

const jwtSignLocation =
  "frontend/test/__support__/e2e/external/e2e-jwt-sign.js";

export function visitEmbeddedPage(payload) {
  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };

  const stringifiedPayload = JSON.stringify(payloadWithExpiration);

  const embeddableObject = getEmbeddableObject(payload);

  const urlRoot = `/embed/${embeddableObject}/`;
  // Style is hard coded for now because we're not concerned with testing its properties
  const style = "#bordered=true&titled=true";

  cy.exec(
    `node  ${jwtSignLocation} '${stringifiedPayload}' ${METABASE_SECRET_KEY}`,
  ).then(({ stdout: token }) => {
    cy.visit(urlRoot + token + style);
  });
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
