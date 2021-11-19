const hasSnowplowMicro = Cypress.env("HAS_SNOWPLOW_MICRO");
const snowplowMicroUrl = Cypress.env("SNOWPLOW_MICRO_URL");

export const describeWithSnowplow = hasSnowplowMicro ? describe : describe.skip;

export const resetSnowplow = () => {
  cy.request({
    url: `${snowplowMicroUrl}/micro/reset`,
    json: true,
  });
};

export const blockSnowplow = () => {
  cy.intercept("POST", `${snowplowMicroUrl}/*/tp2`, req => {
    req.destroy();
  });
};

export const expectGoodEvents = count => {
  cy.request({
    url: `${snowplowMicroUrl}/micro/good`,
    json: true,
  }).then(res => {
    expect(res.body.length).to.eq(count);
  });
};

export const expectNoBadEvents = () => {
  cy.request({
    url: `${snowplowMicroUrl}/micro/bad`,
    json: true,
  }).then(res => {
    expect(res.body.length).to.eq(0);
  });
};
