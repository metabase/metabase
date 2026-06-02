import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { modal, popover } from "e2e/support/helpers";

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
  shouldPropagateToChildren = null,
) {
  selectPermissionRow(item, permissionIndex);

  popover()
    .should("have.length", 1)
    .within(() => {
      if (shouldPropagateToChildren !== null) {
        cy.findByRole("switch")
          .as("toggle")
          .then(($el) => {
            if (
              $el.attr("aria-checked") !== shouldPropagateToChildren.toString()
            ) {
              cy.get("@toggle").click();
            }
          });
      }
      if (value) {
        cy.findByText(value).click();
      }
    });
}

export function selectPermissionRow(item, permissionIndex) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
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

  rows.forEach((row) => {
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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  getPermissionRowPermissions(item)
    .eq(permissionColumnIndex)
    .should("have.text", permissionValue);
}

/**
 * @param {string} row
 * @param {number} index
 * @param {string} permission
 * @param {boolean} isDisabled
 */
export function isPermissionDisabled(row, index, permission, isDisabled) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return getPermissionRowPermissions(row)
    .eq(index)
    .should("have.attr", "aria-disabled", isDisabled.toString())
    .contains(permission);
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
    cy.findByRole("textbox", { name: "User attribute" }).click();
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
  const {
    requestAlias = "@dataset",
    columnId,
    columnAssertion,
    dashcardId,
  } = options;

  cy.get(requestAlias).should(({ response }) => {
    const data =
      dashcardId !== undefined
        ? extractBatchCardData(response.body, dashcardId)
        : response.body.data;

    // check if data is reporting itself as sandboxed
    expect(data.is_sandboxed).to.equal(true);

    // if options to make assertions on a column's data
    if (columnId && columnAssertion) {
      const colIndex = data.cols.findIndex((c) => c.id === columnId);
      expect(colIndex).to.be.gte(0);

      const values = data.rows.map((row) => row[colIndex]);

      const assertionFn = _.isFunction(columnAssertion)
        ? columnAssertion
        : (val) => val === columnAssertion;
      const errMsg = `Expected every result in column to be equal to: ${columnAssertion}`;
      expect(values.every(assertionFn)).to.equal(true, errMsg);
    }
  });
}

// Parse the NDJSON body of a batch-card-query response and reconstruct the
// dataset for a specific dashcard by merging its card-begin/rows/end envelopes.
function extractBatchCardData(body, dashcardId) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const messages = text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const beginMsg = messages.find(
    (m) => m.type === "card-begin" && m.dashcard_id === dashcardId,
  );
  const endMsg = messages.find(
    (m) => m.type === "card-end" && m.dashcard_id === dashcardId,
  );
  expect(endMsg, `no card-end for dashcard ${dashcardId}`).to.not.be.undefined;

  const rows = messages
    .filter((m) => m.type === "card-rows" && m.dashcard_id === dashcardId)
    .flatMap((m) => m.rows);

  return { ...(beginMsg?.data ?? {}), ...endMsg.data, rows };
}

export function blockUserGroupPermissions(groupId, databaseId = SAMPLE_DB_ID) {
  return cy.updatePermissionsGraph({
    [groupId]: {
      [databaseId]: {
        "view-data": "blocked",
        "create-queries": "no",
      },
    },
  });
}

export function saveChangesToPermissions() {
  cy.intercept("PUT", "/api/permissions/graph").as("updatePermissions");
  cy.intercept("PUT", "/api/ee/advanced-permissions/application/graph").as(
    "updatePermissions",
  );
  cy.log("Save changes to permissions");

  cy.findByTestId("edit-bar")
    .findByRole("button", { name: "Save changes" })
    .click();

  modal().within(() => {
    cy.findByText("Save permissions?");
    cy.findByText("Are you sure you want to do this?");
    cy.button("Yes").click();
  });
  cy.wait("@updatePermissions");
}
