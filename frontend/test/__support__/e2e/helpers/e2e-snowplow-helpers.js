const HAS_SNOWPLOW = Cypress.env("HAS_SNOWPLOW_MICRO");
const SNOWPLOW_URL = Cypress.env("SNOWPLOW_MICRO_URL");
const SNOWPLOW_INTERVAL = 100;
const SNOWPLOW_RETRIES = 10;

export const describeWithSnowplow = HAS_SNOWPLOW ? describe : describe.skip;

export const resetSnowplow = () => {
  sendSnowplowRequest("micro/reset");
};

export const blockSnowplow = () => {
  blockSnowplowRequest("*/tp2");
};

export const expectGoodSnowplowEvents = count => {
  retrySnowplowRequest("micro/good", ({ body }) => body.length >= count)
    .its("body")
    .should("have.length", count);
};

export const expectNoBadSnowplowEvents = () => {
  sendSnowplowRequest("micro/bad")
    .its("body")
    .should("have.length", 0);
};

const sendSnowplowRequest = url => {
  return cy.request({
    url: `${SNOWPLOW_URL}/${url}`,
    json: true,
  });
};

const retrySnowplowRequest = (url, condition, retries = SNOWPLOW_RETRIES) => {
  return sendSnowplowRequest(url).then(response => {
    if (condition(response)) {
      return cy.wrap(response);
    } else if (retries > 0) {
      cy.wait(SNOWPLOW_INTERVAL);
      return retrySnowplowRequest(url, condition, retries - 1);
    } else {
      throw new Error(response);
    }
  });
};

const blockSnowplowRequest = url => {
  return cy.intercept("POST", `${SNOWPLOW_URL}/${url}`, req => req.destroy());
};
