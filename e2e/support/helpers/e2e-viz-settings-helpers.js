export function openSeriesSettings(field, isBreakout = false) {
  if (isBreakout) {
    cy.get("[data-testid^=draggable-item]")
      .contains(field)
      .closest("[data-testid^=draggable-item]")
      .find(".Icon-ellipsis")
      .click();
  } else {
    cy.findAllByTestId("chartsettings-field-picker-select")
      .then($elements => cy.wrap($elements.find(elem => elem.value === field)))
      .closest("[data-testid=chartsettings-field-picker]")
      .find(".Icon-ellipsis")
      .click();
  }
}
