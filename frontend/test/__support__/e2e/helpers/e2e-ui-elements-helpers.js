// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
export function popover() {
  return cy.get(".PopoverContainer.PopoverContainer--open");
}

export function modal() {
  return cy.get(".ModalContainer .ModalContent");
}

export function sidebar() {
  return cy.get("aside");
}

export function browse() {
  // takes you to `/browse` (reflecting changes made in `0.38-collection-redesign)
  return cy.get(".Nav .Icon-table_spaced");
}

/**
 * Get the `fieldset` HTML element that we use as a filter widget container.
 *
 * @returns HTMLFieldSetElement
 *
 * @example
 * // Simple SQL filter widget (works for "Text" and "Number" SQL variable types)
 * filterWidget().type("123");
 *
 * @example
 * // Filter widget that opens some other type of a filter picker (search, dropdown, input)
 * filterWidget()
 *  .contains("Search")
 *  .click();
 *
 * @todo Add the ability to choose between multiple widgets using their index.
 * @todo Add the ability to alias the chosen filter widget.
 * @todo Extract into a separate helper file.
 */
export function filterWidget() {
  return cy.get("fieldset");
}
