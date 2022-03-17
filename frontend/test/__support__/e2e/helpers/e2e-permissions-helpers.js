import { popover } from "__support__/e2e/cypress";

export function selectSidebarItem(item) {
  cy.findAllByRole("menuitem")
    .contains(item)
    .click();
}

export function assertSidebarItems(items) {
  cy.findAllByRole("menuitem").each(($menuItem, index) =>
    cy.wrap($menuItem).should("have.text", items[index]),
  );
}

export function modifyPermission(
  item,
  permissionIndex,
  value,
  shouldPropagate = null,
) {
  getPermissionRowPermissions(item)
    .eq(permissionIndex)
    .click();

  popover().within(() => {
    if (shouldPropagate !== null) {
      cy.findByRole("switch")
        .as("toggle")
        .then($el => {
          if ($el.attr("aria-checked") !== shouldPropagate.toString()) {
            cy.get("@toggle").click();
          }
        });
    }
    cy.findByText(value).click();
  });
}

function getPermissionRowPermissions(item) {
  return cy
    .get("tbody > tr")
    .contains(item)
    .closest("tr")
    .findAllByTestId("permissions-select");
}

export function assertPermissionTable(rows) {
  cy.get("tbody > tr").should("have.length", rows.length);

  rows.forEach(row => {
    const [item, ...permissions] = row;

    getPermissionRowPermissions(item).each(($permissionEl, index) => {
      cy.wrap($permissionEl).should("have.text", permissions[index]);
    });
  });
}

/**
 * @param {string} index
 * @param {string} permission
 * @param {boolean} isDisabled
 */
export function isPermissionDisabled(index, permission, isDisabled) {
  return cy
    .findAllByTestId("permissions-select")
    .eq(index)
    .contains(permission)
    .closest("a")
    .should("have.attr", "aria-disabled", isDisabled.toString());
}
