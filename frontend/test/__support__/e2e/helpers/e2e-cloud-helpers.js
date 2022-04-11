export const setupMetabaseCloud = () => {
  cy.request("PUT", "/api/setting/site-url", {
    value: "https://CYPRESSTESTENVIRONMENT.metabaseapp.com",
  });
};
