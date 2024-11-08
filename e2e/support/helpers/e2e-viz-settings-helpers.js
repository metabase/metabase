export function openSeriesSettings(field, isBreakout = false) {
  if (isBreakout) {
    cy.get("[data-testid^=draggable-item]")
      .contains(field)
      .closest("[data-testid^=draggable-item]")
      .find(".Icon-ellipsis")
      .click();
  } else {
    cy.findAllByTestId("chartsettings-field-picker")
      .contains(field)
      .closest("[data-testid=chartsettings-field-picker]")
      .find(".Icon-ellipsis")
      .click();
  }
}

export function openVizType(tabName = "Chart") {
  cy.findByTestId("viz-settings-button").click();
  cy.findByTestId("chartsettings-sidebar").findByText(tabName).click();
}
