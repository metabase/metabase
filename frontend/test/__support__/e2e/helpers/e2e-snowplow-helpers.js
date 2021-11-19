const snowplowMicroUrl = Cypress.env("SNOWPLOW_MICRO_URL");

export const resetSnowplow = () => {
  if (snowplowMicroUrl) {
    cy.request({
      url: `${snowplowMicroUrl}/micro/reset`,
      json: true,
    });
  }
};

export const assetSnowplow = () => {
  if (snowplowMicroUrl) {
    cy.request({
      url: `${snowplowMicroUrl}/micro/bad`,
      json: true,
    }).then(response => {
      expect(response.body.length).to.eq(0);
    });
  }
};
