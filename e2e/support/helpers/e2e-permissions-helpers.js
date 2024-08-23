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

// helps make a few types of assertion on sandboxed request data
// in all cases it checks if the API responds with the `is_sandboxed` boolean set to `true` in the response
// 1. assertDatasetReqIsSandboxed() - only checks if the api responds with `is_sandboxed`, defaults request alias to `@dataset`
// 2. assertDatasetReqIsSandboxed("@customAlias") - only checks if the api responds with `is_sandboxed`, uses custom provided alias instead of default
// 3. assertDatasetReqIsSandboxed(fieldId, literalValue) - checks `is_sandboxed`, asserts that data in response equals the literal value for the column matching fieldId
// 4. assertDatasetReqIsSandboxed(fieldId, predicateFn) - checks `is_sandboxed`, asserts a predicate function on every value for the column matching fieldId
// 5. assertDatasetReqIsSandboxed(fieldId, literalValue | predicateFn, "@customAlias") - all the things combined
export function assertDatasetReqIsSandboxed(
  sandboxedFieldId,
  sandboxedFieldAssertion,
  requestAlias = "@dataset",
) {
  if (arguments.length === 1) {
    requestAlias = sandboxedFieldId;
    sandboxedFieldId = undefined;
  }

  cy.get(requestAlias).then(({ response }) => {
    const { data } = response.body;
    expect(data.is_sandboxed).to.equal(true);

    if (sandboxedFieldId && sandboxedFieldAssertion) {
      const colIndex = data.cols.findIndex(c => c.id === sandboxedFieldId);
      expect(colIndex).to.be.gte(0);
      const sandboxedColumnValues = data.rows.map(row => row[colIndex]);
      if (sandboxedFieldAssertion === "function") {
        sandboxedFieldAssertion(sandboxedColumnValues);
      } else {
        expect(
          sandboxedColumnValues.every(val => val === sandboxedFieldAssertion),
        ).to.equal(
          true,
          `Expected every result in column to be equal to: ${sandboxedFieldAssertion}`,
        );
      }
    }
  });
}
