export function openSeriesSettings(field, isBreakout = false) {
  if (isBreakout) {
    cy.get("[data-testid^=draggable-item]")
      .contains(field)
      .closest("[data-testid^=draggable-item]")
      .find(".Icon-ellipsis")
      .click({ force: true });
  } else {
    cy.findAllByTestId("chartsettings-field-picker-select")
      .then($elements => {
        for (const element of $elements) {
          if (element.value === field) {
            return cy.wrap(element);
          }
        }
      })
      .closest("[data-testid=chartsettings-field-picker]")
      .icon("ellipsis")
      .click({ force: true });
  }
}
