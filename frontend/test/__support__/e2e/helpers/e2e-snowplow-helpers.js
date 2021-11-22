const hasSnowplowMicro = Cypress.env("HAS_SNOWPLOW_MICRO");
const snowplowMicroUrl = Cypress.env("SNOWPLOW_MICRO_URL");

export const describeWithSnowplow = hasSnowplowMicro ? describe : describe.skip;

export const resetSnowplow = () => {
  sendSnowplowRequest("micro/reset");
};

export const blockSnowplow = () => {
  blockSnowplowRequest("*/tp2");
};

export const expectGoodSnowplowEvents = count => {
  retrySnowplowRequest("micro/good")
    .its("body")
    .should("have.length", count);
};

export const expectNoBadSnowplowEvents = () => {
  retrySnowplowRequest("micro/bad")
    .its("body")
    .should("be.empty");
};

const sendSnowplowRequest = url => {
  return cy.request({
    url: `${snowplowMicroUrl}/${url}`,
    json: true,
  });
};

const blockSnowplowRequest = url => {
  return cy.intercept("POST", `${snowplowMicroUrl}/${url}`, req => {
    req.destroy();
  });
};

const retrySnowplowRequest = url => {
  return cy.wrap({ command: () => sendSnowplowRequest(url) }).invoke("command");
};
