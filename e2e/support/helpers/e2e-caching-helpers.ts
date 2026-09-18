export const cacheStrategySidesheet = () =>
  cy.findByRole("dialog", { name: /Caching settings/ }).should("be.visible");

export const cacheStrategySelect = () =>
  cy
    .findByRole("form", { name: "Cache invalidation policy" })
    .findByTestId("cache-strategy-select");

/** Open the strategy dropdown and pick an option by its title (e.g. /Duration/).
 * Options render in a portal at the document root, so this must not run inside
 * a `.within()` scoped to the form/sidesheet. */
export const selectCacheStrategy = (name: RegExp) => {
  cacheStrategySelect().click();
  cy.findByRole("option", { name }).click();
};

/** Selecting the Duration strategy leaves the duration field empty, and the
 * form cannot be saved until it is filled. */
export const fillCacheDuration = (value: number) =>
  cy.findByRole("spinbutton", { name: /Cache duration/ }).type(String(value));
