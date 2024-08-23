import _ from "underscore";

import { popover } from "e2e/support/helpers";

export function selectSidebarItem(item) {
  cy.findAllByRole("menuitem").contains(item).click();
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
  selectPermissionRow(item, permissionIndex);

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
    value && cy.findByText(value).click();
  });
}

export function selectPermissionRow(item, permissionIndex) {
  getPermissionRowPermissions(item).eq(permissionIndex).click();
}

export function getPermissionRowPermissions(item) {
  return cy
    .findByTestId("permission-table")
    .find("tbody > tr")
    .contains(item)
    .closest("tr")
    .findAllByTestId("permissions-select");
}

export function assertPermissionTable(rows) {
  cy.findByTestId("permission-table")
    .find("tbody > tr")
    .should("have.length", rows.length);

  rows.forEach(row => {
    const [item, ...permissions] = row;

    getPermissionRowPermissions(item).each(($permissionEl, index) => {
      cy.wrap($permissionEl).should("have.text", permissions[index]);
    });
  });
}

export function assertPermissionOptions(options) {
  popover().within(() => {
    cy.findAllByRole("option")
      .should("have.length", options.length)
      .each(($accessEl, index) => {
        cy.wrap($accessEl).findByText(options[index]);
      });
  });
}

export function assertPermissionForItem(
  item,
  permissionColumnIndex,
  permissionValue,
) {
  getPermissionRowPermissions(item)
    .eq(permissionColumnIndex)
    .should("have.text", permissionValue);
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

export const dismissSplitPermsModal = () => {
  cy.findByRole("dialog", { name: /permissions may look different/ })
    .findByRole("button", { name: "Got it" })
    .click();
};

export function savePermissions() {
  cy.findByTestId("edit-bar").button("Save changes").click();
  cy.findByRole("dialog").findByText("Yes").click();
  cy.findByTestId("edit-bar").should("not.exist");
}

export function selectImpersonatedAttribute(attribute) {
  cy.findByRole("dialog").within(() => {
    cy.findByTestId("select-button").click();
  });

  popover().findByText(attribute).click();
}

export function saveImpersonationSettings() {
  cy.findByRole("dialog").findByText("Save").click();
}

export function assertSameBeforeAndAfterSave(assertionCallback) {
  assertionCallback();
  savePermissions();
  assertionCallback();
}

export function assertDatasetReqIsSandboxed(options = {}) {
  const { requestAlias = "@dataset", columnId, columnAssertion } = options;

  cy.get(requestAlias).then(({ response }) => {
    // check if data is reporting itself as sandboxed
    const { data } = response.body;
    expect(data.is_sandboxed).to.equal(true);

    // if options to make assertions on a columns data
    if (columnId && columnAssertion) {
      const colIndex = data.cols.findIndex(c => c.id === columnId);
      expect(colIndex).to.be.gte(0);

      const values = data.rows.map(row => row[colIndex]);

      const assertionFn = _.isFunction(columnAssertion)
        ? columnAssertion
        : val => val === columnAssertion;
      const errMsg = `Expected every result in column to be equal to: ${columnAssertion}`;
      expect(values.every(assertionFn)).to.equal(true, errMsg);
    }
  });
}
