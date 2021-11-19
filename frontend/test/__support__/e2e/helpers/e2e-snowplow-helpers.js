const snowplowMicroUrl = Cypress.env("SNOWPLOW_MICRO_URL");

export const resetSnowplow = () => {
  if (snowplowMicroUrl) {
    cy.request({
      url: `${snowplowMicroUrl}/micro/reset`,
      json: true,
    });
  }
};

export const blockSnowplow = () => {
  if (snowplowMicroUrl) {
    cy.intercept("POST", `${snowplowMicroUrl}/*/tp2`, req => {
      req.destroy();
    });
  }
};

export const expectGoodEvents = count => {
  if (snowplowMicroUrl) {
    cy.request({
      url: `${snowplowMicroUrl}/micro/good`,
      json: true,
    }).then(res => {
      expect(res.body.length).to.eq(count);
    });
  }
};

export const expectNoBadEvents = () => {
  if (snowplowMicroUrl) {
    cy.request({
      url: `${snowplowMicroUrl}/micro/bad`,
      json: true,
    }).then(res => {
      expect(res.body.length).to.eq(0);
    });
  }
};
