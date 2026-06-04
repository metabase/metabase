export const cacheStrategySidesheet = () =>
  cy.findByRole("dialog", { name: /Caching settings/ }).should("be.visible");

export const cacheStrategySelect = () =>
  cy
    .findByRole("form", { name: "Select the cache invalidation policy" })
    .findByTestId("cache-strategy-select");

/** Open the strategy dropdown and pick an option by its title (e.g. /Duration/).
 * Options render in a portal at the document root, so this must not run inside
 * a `.within()` scoped to the form/sidesheet. */
export const selectCacheStrategy = (name: RegExp) => {
  cacheStrategySelect().click();
  cy.findByRole("option", { name }).click();
};
