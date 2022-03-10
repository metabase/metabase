import { METABASE_SECRET_KEY } from "__support__/e2e/cypress_data";

const jwtSignLocation =
  "frontend/test/__support__/e2e/external/e2e-jwt-sign.js";

export function visitEmbeddedPage(payload) {
  const stringifiedPayload = JSON.stringify(payload);

  cy.exec(
    `node  ${jwtSignLocation} '${stringifiedPayload}' ${METABASE_SECRET_KEY}`,
  ).then(({ stdout: token }) => {
    cy.visit("/embed/question/" + token + "#bordered=true&titled=true");
  });
}
