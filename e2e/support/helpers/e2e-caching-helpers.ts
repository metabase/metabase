export const cacheStrategySidesheet = () =>
  cy.findByRole("dialog", { name: /Caching settings/ }).should("be.visible");

export const durationRadioButton = () =>
  cy
    .findByRole("form", { name: "Select the cache invalidation policy" })
    .findByRole("radio", { name: /Duration/ });
