export function openSeriesSettings(field, isBreakout = false) {
  if (isBreakout) {
    cy.get("[data-testid^=draggable-item]")
      .contains(field)
      .closest("[data-testid^=draggable-item]")
      .find(".Icon-ellipsis")
      .click({ force: true });
  } else {
    cy.findAllByTestId("chart-setting-select")
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

export function openVizTypeSidebar({ isSidebarOpen = false } = {}) {
  if (isSidebarOpen) {
    cy.findByTestId("chartsettings-sidebar").findAllByRole("tab").eq(0).click();
  } else {
    cy.findByTestId("viz-settings-button").click();
  }
}

export function openVizSettingsSidebar({ isSidebarOpen = false } = {}) {
  if (!isSidebarOpen) {
    cy.findByTestId("viz-settings-button").click();
  }

  // we open Chart Type selector by default, so clicking on the next tab actually opens settings
  cy.findByTestId("chartsettings-sidebar").findAllByRole("tab").eq(1).click();
}

export function closeVizSettingsSidebar() {
  cy.findByTestId("viz-settings-done-button").click();
}
