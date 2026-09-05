/**
 * Helpers for the view-data permissions port
 * (e2e/test/scenarios/permissions/view-data.cy.spec.js).
 *
 * Most of the data-permission UI surface already exists and is imported
 * READ-ONLY from the sibling permission ports:
 *
 * - `getPermissionRowPermissions` / `selectPermissionRow` / `selectSidebarItem`
 *   / `permissionTable` / `ALL_USERS_GROUP` — support/create-queries.ts
 * - `modifyPermission` / `COLLECTION_GROUP` — support/admin-permissions.ts
 * - `assertPermissionForItem` — support/download-permissions.ts
 * - `isPermissionDisabled` — support/downgrade-ee-to-oss.ts
 * - `modal` / `popover` — support/ui.ts, `tooltip` — support/charts.ts
 *
 * What lives here is what has no home yet: `savePermissions`,
 * `assertSameBeforeAndAfterSave`, the impersonation-modal helpers, the
 * knex-backed `createTestRoles`, and the spec-local flow helpers.
 */
import type { Page } from "@playwright/test";

import { modifyPermission } from "./admin-permissions";
import { getPermissionRowPermissions, permissionTable } from "./create-queries";
import { expect } from "./fixtures";
import { modal, popover } from "./ui";

/** The spec's three permission-column indices. */
export const DATA_ACCESS_PERM_IDX = 0;
export const CREATE_QUERIES_PERM_IDX = 1;
export const DOWNLOAD_PERM_IDX = 2;

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres12 container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

/**
 * Port of H.assertPermissionTable (e2e-permissions-helpers.js).
 *
 * WHY THIS IS NOT support/create-queries.ts's copy, and why it is deliberately
 * weaker than "assert the whole expected row":
 *
 * Upstream's inner loop is
 *   `getPermissionRowPermissions(item).each(($el, index) => $el.should("have.text", permissions[index]))`
 * — it iterates over the **actual** cells in the DOM, indexing into the
 * expected array. So any expected value **past the rendered column count is
 * never compared**. Measured on this spec against the jar: every permission
 * table here renders **5** `permissions-select` cells, while several of the
 * spec's expectation rows list **6** values. The trailing value is dead weight
 * upstream — it asserts nothing.
 *
 * This is ported verbatim (see findings-inbox/view-data-permissions.md): the
 * rule is that an upstream vacuous assertion gets carried over with the
 * analysis inline rather than silently strengthened, especially on a security
 * surface. `create-queries.ts`'s copy iterates the *expected* array instead,
 * which is a different (and here, failing) shape — hence the local version.
 *
 * The one place we do match upstream's strictness: when the table renders MORE
 * cells than expected, upstream compares against `permissions[index] ===
 * undefined` and fails. So do we.
 */
export async function assertPermissionTable(page: Page, rows: string[][]) {
  await expect(permissionTable(page).locator("tbody > tr")).toHaveCount(
    rows.length,
  );

  for (const [item, ...permissions] of rows) {
    const cells = getPermissionRowPermissions(page, item);
    // Let the row render before reading its width.
    await expect(cells.first()).toBeVisible();
    const renderedCount = await cells.count();

    expect(
      renderedCount,
      `row "${item}" renders ${renderedCount} permission cells but only ${permissions.length} were expected — upstream would compare the extras against undefined and fail`,
    ).toBeLessThanOrEqual(permissions.length);

    // toHaveText(array) asserts the count and each cell's exact (trimmed,
    // whitespace-collapsed) text, and retries — matching `have.text` per cell.
    await expect(cells).toHaveText(permissions.slice(0, renderedCount));
  }
}

/**
 * Port of H.savePermissions (e2e-permissions-helpers.js):
 *
 *   cy.findByTestId("edit-bar").button("Save changes").click();
 *   cy.findByRole("dialog").findByText("Yes").click();
 *   cy.findByTestId("edit-bar").should("not.exist");
 *
 * The trailing edit-bar-gone assertion is upstream's own settle gate, so no
 * extra response anchor is needed — the bar only disappears once the save has
 * been applied.
 */
export async function savePermissions(page: Page) {
  await page
    .getByTestId("edit-bar")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  // cy.findByRole("dialog").findByText("Yes") — the confirmation modal.
  await page
    .getByRole("dialog")
    .getByText("Yes", { exact: true })
    .click();
  await expect(page.getByTestId("edit-bar")).toHaveCount(0);
}

/**
 * Port of H.assertSameBeforeAndAfterSave: run the assertions, save, run them
 * again. The point is that saving doesn't change what's rendered.
 */
export async function assertSameBeforeAndAfterSave(
  page: Page,
  assertionCallback: () => Promise<void>,
) {
  await assertionCallback();
  await savePermissions(page);
  await assertionCallback();
}

/**
 * Port of H.selectImpersonatedAttribute: open the impersonation dialog's
 * "User attribute" combobox and pick `attribute` from the popover.
 */
export async function selectImpersonatedAttribute(
  page: Page,
  attribute: string,
) {
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "User attribute", exact: true })
    .click();
  // Mantine Select rows aren't clickable via their text div (PORTING wave-10),
  // so pick the option by role.
  await popover(page)
    .getByRole("option", { name: attribute, exact: true })
    .click();
}

/** Port of H.saveImpersonationSettings: the dialog's Save button. */
export async function saveImpersonationSettings(page: Page) {
  await page.getByRole("dialog").getByText("Save", { exact: true }).click();
}

/**
 * Port of H.createTestRoles({ type: "postgres" }) →
 * cy.task("createTestRoles") → e2e/support/db_tasks.js createTestRoles, which
 * runs every statement in `Roles.postgres` (e2e/support/test_roles.js) against
 * the QA Postgres container.
 *
 * There is no cy.task equivalent in this harness, so we talk to the container
 * directly with knex — the same approach support/actions-on-dashboards.ts and
 * support/custom-column-reproductions-1.ts already use. `knex`/`pg` are not
 * dependencies of this package; they resolve from the repo-root node_modules
 * (the drivers Cypress itself uses), so the require is lazy — this module must
 * still load when the QA-DB gate is off and they may be absent.
 *
 * The SQL is copied verbatim from e2e/support/test_roles.js (which is not ours
 * to import — it lives in the Cypress tree and is plain JS).
 */
const ORDERS_PRODUCTS_ACCESS = "orders_products_access";

const CREATE_ORDERS_PRODUCTS_ACCESS_ROLE_SQL = `
    DO
    $do$
    BEGIN
      IF NOT EXISTS ( SELECT FROM pg_roles
                      WHERE  rolname = '${ORDERS_PRODUCTS_ACCESS}') THEN

        CREATE ROLE ${ORDERS_PRODUCTS_ACCESS};

    GRANT SELECT, INSERT, UPDATE, DELETE ON Orders TO ${ORDERS_PRODUCTS_ACCESS};
    GRANT SELECT, INSERT, UPDATE, DELETE ON Products TO ${ORDERS_PRODUCTS_ACCESS};


      END IF;
    END
    $do$;
  `;

/** QA_DB_CONFIG.postgres from e2e/support/cypress_data.js. */
const QA_PG_CONFIG = {
  client: "pg",
  connection: {
    host: "localhost",
    user: "metabase",
    password: "metasample123",
    database: "sample",
    ssl: false,
    port: 5404,
  },
};

type RawKnexClient = {
  raw(sql: string): Promise<unknown>;
  destroy(): Promise<void>;
};

export async function createTestRoles() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => RawKnexClient;
  const client = Knex(QA_PG_CONFIG);
  try {
    await client.raw(CREATE_ORDERS_PRODUCTS_ACCESS_ROLE_SQL);
  } finally {
    await client.destroy();
  }
}

/**
 * Port of the spec-local makeOrdersSandboxed(): from the group-focused schema
 * page, set Orders' view-data to "Row and column security" and fill in the
 * sandboxing modal (column → user attribute → Save).
 *
 * Upstream's selectors here are unscoped (`cy.findByText("Pick a column")`),
 * unlike the near-identical block in the "sandboxed" describe which scopes to
 * `H.modal()`. Kept unscoped-but-page-level; the modal is the only thing on
 * screen carrying this copy.
 */
export async function makeOrdersSandboxed(
  page: Page,
  { allUsersGroup, sampleDbId, ordersId }: {
    allUsersGroup: number;
    sampleDbId: number;
    ordersId: number;
  },
) {
  await modifyPermission(
    page,
    "Orders",
    DATA_ACCESS_PERM_IDX,
    "Row and column security",
  );

  await expect(page).toHaveURL(
    new RegExp(
      `/admin/permissions/data/group/${allUsersGroup}/database/${sampleDbId}/schema/PUBLIC/${ordersId}/segmented`,
    ),
  );

  await expect(
    page.getByText("Configure row and column security for this table", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();

  await configureSandboxColumnAndAttribute(page);
}

/**
 * The shared tail of every sandboxing-modal block in this spec: pick the
 * "User ID" column, map it to the "attr_uid" user attribute, Save.
 *
 * `Pick a column` opens a TippyPopover (the shared `popover()` selector);
 * `Pick a user attribute` is a Mantine Select whose rows must be picked by
 * role rather than by clicking the text div (PORTING wave-10 gotcha).
 */
export async function configureSandboxColumnAndAttribute(page: Page) {
  await page.getByText("Pick a column", { exact: true }).click();
  await popover(page).getByText("User ID", { exact: true }).click();

  await page.getByPlaceholder("Pick a user attribute").click();
  await popover(page).getByRole("option", { name: "attr_uid", exact: true }).click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
}

/** Same as the above, but with every step scoped to the modal — the form the
 * "sandboxed > group focused view" and 46450 tests use upstream. */
export async function configureSandboxColumnAndAttributeInModal(page: Page) {
  await modal(page).getByText("Pick a column", { exact: true }).click();
  await popover(page).getByText("User ID", { exact: true }).click();
  await modal(page).getByPlaceholder("Pick a user attribute").click();
  await popover(page).getByRole("option", { name: "attr_uid", exact: true }).click();
  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
}

/**
 * Port of the spec-local lackPermissionsView(shouldExist).
 *
 * Upstream uses an unscoped `cy.findByText(...)`, an EXACT testing-library
 * match (PORTING rule 1).
 */
export async function lackPermissionsView(page: Page, shouldExist: boolean) {
  const message = page.getByText(
    "Sorry, you don't have permission to run this query.",
    { exact: true },
  );
  if (shouldExist) {
    await expect(message).toBeVisible();
  } else {
    await expect(message).toHaveCount(0);
  }
}
