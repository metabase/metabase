/**
 * Spec-local helpers for tests/tenants.spec.ts (port of
 * e2e/test/scenarios/admin-2/tenants.cy.spec.ts).
 *
 * Per PORTING rule 9 this is a NEW module — it imports read-only from the
 * shared modules and edits none of them. The tenant/tenant-user fixture shapes
 * duplicate `support/tenant-users-sidecar.ts` deliberately: that module exports
 * only the Gizmo pair, and this spec needs Doohickey + a second Doohickey user
 * plus the `Tenant[]`/`TenantUser[]` lists. Consolidation candidate.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { signJwt } from "./interactive-embedding";
import { JWT_SHARED_SECRET } from "./sdk-iframe";
import { popover } from "./ui";

export { JWT_SHARED_SECRET, signJwt };

export interface TenantAttributes {
  CAPS?: string;
  color?: string;
}

export interface Tenant {
  name: string;
  slug: string;
  attributes?: TenantAttributes;
}

export interface TenantUser {
  first_name: string;
  last_name: string;
  email: string;
  "@tenant": string;
}

export const GIZMO_TENANT: Tenant = {
  name: "Gizmos",
  slug: "gizmo",
  attributes: {
    CAPS: "✨GIZMO✨",
    color: "cerulean",
  },
};

export const DOOHICKEY_TENANT: Tenant = {
  name: "Doohickey",
  slug: "doohickey",
};

export const GIZMO_USER: TenantUser = {
  first_name: "gizmo",
  last_name: "user",
  email: "gizmo.user@email.com",
  "@tenant": GIZMO_TENANT.slug,
};

export const DOOHICKEY_USER: TenantUser = {
  first_name: "doohickey",
  last_name: "user",
  email: "doohickey.user@email.com",
  "@tenant": DOOHICKEY_TENANT.slug,
};

export const SECOND_DOOHICKEY_USER: TenantUser = {
  first_name: "donthickey",
  last_name: "user",
  email: "donthickey.user@email.com",
  "@tenant": DOOHICKEY_TENANT.slug,
};

export const TENANTS: Tenant[] = [GIZMO_TENANT, DOOHICKEY_TENANT];
export const USERS: TenantUser[] = [
  GIZMO_USER,
  DOOHICKEY_USER,
  SECOND_DOOHICKEY_USER,
];

/** Port of H.getFullName (e2e/support/helpers/e2e-user-helpers.ts). */
export function getFullName(user: {
  first_name: string;
  last_name: string;
}): string {
  return `${user.first_name} ${user.last_name}`;
}

export const GIZMO_FULL_NAME = getFullName(GIZMO_USER);

/**
 * Mirrors ALL_EXTERNAL_USERS_GROUP_ID / COLLECTION_GROUP_ID
 * (e2e/support/cypress_sample_instance_data.js) — fixed ids baked into the
 * `default` snapshot. Cross-checked against support/embedding-hub.ts (3) and
 * support/admin-permissions.ts (5).
 */
export const ALL_EXTERNAL_USERS_GROUP_ID = 3;
export const COLLECTION_GROUP_ID = 5;

/** Mirrors SAMPLE_DB_TABLES (e2e/support/cypress_data.js). */
export const STATIC_ORDERS_ID = 5;
export const STATIC_PRODUCTS_ID = 7;

/** Port of the spec-local createTenants: POST each fixture tenant. */
export async function createTenants(api: MetabaseApi): Promise<void> {
  for (const tenant of TENANTS) {
    await api.post("/api/ee/tenant", tenant);
  }
}

/**
 * Port of the spec-local createUsers: GET the tenant list, resolve each
 * fixture user's `@tenant` slug to an id, then POST the user.
 */
export async function createUsers(api: MetabaseApi): Promise<void> {
  const body = (await (await api.get("/api/ee/tenant")).json()) as {
    data: { id: number; slug: string }[];
  };
  for (const user of USERS) {
    const tenant = body.data.find((t) => t.slug === user["@tenant"]);
    if (!tenant) {
      throw new Error(`No tenant with slug ${user["@tenant"]}`);
    }
    await api.post("/api/user", { ...user, tenant_id: tenant.id });
  }
}

/**
 * Port of the `cy.task("signJwt")` + `cy.request("GET", "/auth/sso?…")` pair
 * the beforeEach uses to provision each tenant user.
 *
 * `iat` is set explicitly: upstream signs via `jsonwebtoken`, which stamps it
 * automatically, and the backend unsigns with `{:max-age three-minutes}`
 * (sso/providers/jwt.clj). The bare `signJwt` port adds no claims.
 *
 * Upstream uses `cy.request` (no browser navigation) — it only wants the users
 * provisioned, not a browser session.
 *
 * It deliberately does NOT go through `mb.api`. `/auth/sso` responds with a
 * `Set-Cookie: metabase.SESSION` for the tenant user, and the harness's
 * `APIRequestContext` keeps its own cookie jar which the backend prefers over
 * the `X-Metabase-Session` header. `mb.signInAsAdmin()` only re-sets cookies on
 * the *browser* context, so it cannot undo that — every later admin API call
 * then runs as the last-provisioned tenant user (measured: `POST /api/card` →
 * 403 for all four tests in this describe). Cypress never saw this because
 * `cy.request` shares the browser jar, which `signInAsAdmin` does replace.
 * A bare `fetch` with `redirect: "manual"` provisions the user and discards
 * the cookie.
 */
export async function provisionViaJwt(
  baseUrl: string,
  user: TenantUser,
  returnTo = "/question/notebook",
): Promise<void> {
  const token = signJwt(
    { ...user, iat: Math.floor(Date.now() / 1000) },
    JWT_SHARED_SECRET,
  );
  const response = await fetch(
    `${baseUrl}/auth/sso?return_to=${returnTo}&jwt=${token}`,
    { redirect: "manual" },
  );
  if (response.status >= 400) {
    throw new Error(
      `/auth/sso -> ${response.status} ${await response.text().catch(() => "")}`,
    );
  }
}

/**
 * Port of `cy.task("signJwt")` + `cy.visit("/auth/sso?…")`: navigate the
 * browser at the backend's real `/auth/sso`, which provisions the user, issues
 * a session cookie and redirects to `return_to`.
 *
 * The redirect is the app's own (nothing is mocked), so FINDINGS #33 does not
 * apply — `page.goto` follows it natively.
 */
export async function loginWithJwt(
  page: Page,
  user: TenantUser,
  returnTo = "/question/notebook",
): Promise<void> {
  const token = signJwt(
    { ...user, iat: Math.floor(Date.now() / 1000) },
    JWT_SHARED_SECRET,
  );
  await page.goto(`/auth/sso?return_to=${returnTo}&jwt=${token}`);
}

/**
 * Port of `cy.findByRole("textbox", { name: "Give this tenant a name" })
 * .type(name)` in the tenant create modal.
 *
 * Real keystrokes, not `fill()` (PORTING rule 5). `TenantForm`'s name field
 * carries a custom `onChange` that derives the slug and the submit button is
 * gated on Formik's `dirty`; `cy.type()` also clicks its subject first.
 */
export async function typeTenantName(page: Page, name: string): Promise<void> {
  const field = page
    .locator("[role='dialog'][aria-modal='true']")
    .getByRole("textbox", { name: "Give this tenant a name", exact: true });
  await field.click();
  await field.pressSequentially(name);
}

/**
 * `cy.visit("/admin/people/tenants/people")`, retried.
 *
 * The tenants routes sit behind a route guard that reads `use-tenants` from
 * the FE's session-properties cache. When the setting was written moments
 * earlier by the beforeEach, a page load can lose that race and get bounced to
 * `/admin/people` — the internal-users list, which renders perfectly and makes
 * the next step fail with "row not found" rather than "wrong page". Measured
 * once in 4 runs of "should disable users on a tenant when disabling the
 * tenant".
 *
 * This is upstream's own known problem: `createTenantGroupFromUI` carries
 * "FIXME shouldn't be necessary - caused by slow route guard" and works around
 * it by re-clicking the sidebar link after the visit. Retrying the navigation
 * is the same workaround, not a changed assertion.
 */
export async function visitTenantUsers(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto("/admin/people/tenants/people");
    await expect(
      page.getByRole("heading", { name: "Tenant users", exact: true }),
    ).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

/** cy.findByTestId("admin-content-table"). */
export function adminContentTable(page: Page): Locator {
  return page.getByTestId("admin-content-table");
}

/** cy.findByTestId("admin-layout-content"). */
export function adminLayoutContent(page: Page): Locator {
  return page.getByTestId("admin-layout-content");
}

/** cy.findByTestId("admin-people-list-table"). */
export function adminPeopleListTable(page: Page): Locator {
  return page.getByTestId("admin-people-list-table");
}

/** cy.findByRole("navigation", { name: "people-nav" }). */
export function peopleNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "people-nav", exact: true });
}

/**
 * Port of `cy.findAllByRole("row").contains("tr", text)`: Cypress's
 * `.contains(selector, text)` filters to the *first* `tr` whose text contains
 * `text` (case-sensitive substring).
 *
 * The `has` text locator is built from `page`, never from a Locator scope
 * (PORTING wave-11 gotcha).
 */
export function rowContaining(page: Page, text: string): Locator {
  return page
    .getByRole("row")
    .filter({ hasText: new RegExp(escapeRegExp(text)) })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the spec-local `hasGlobeIcon` / `lacksGlobeIcon`:
 * `cy.findByTestId("permission-table").findByText(name).parent().parent()
 *  .icon("globe")`.
 *
 * `.parent().parent()` is two DOM levels up from the text node's element, so
 * `xpath=../..`. `cy.icon(x).should("be.visible")` is an ANY-of-set assertion
 * (PORTING rule 3) — hence `.filter({ visible: true }).first()` on the
 * positive side; the negative side asserts the unfiltered set is empty, which
 * is what `should("not.exist")` checks.
 */
export function globeIconFor(page: Page, groupName: string): Locator {
  return page
    .getByTestId("permission-table")
    .getByText(groupName, { exact: true })
    .locator("xpath=../..")
    .locator(".Icon-globe");
}

export async function expectGlobeIcon(page: Page, groupName: string) {
  await expect(
    globeIconFor(page, groupName).filter({ visible: true }).first(),
  ).toBeVisible();
}

export async function expectNoGlobeIcon(page: Page, groupName: string) {
  // Anchor first: the Cypress chain errors if the group text is missing, so
  // the absence check must not pass on an unrendered table.
  await expect(
    page
      .getByTestId("permission-table")
      .getByText(groupName, { exact: true })
      .first(),
  ).toBeVisible();
  await expect(globeIconFor(page, groupName)).toHaveCount(0);
}

export type AssertionType = "exist" | "not.exist";

/**
 * Port of the spec-local assertPermissionTableColumnsExist. `findByRole` with
 * a string name is exact (rule 1); the `Download results` matcher is a regex
 * upstream and stays one.
 */
export async function assertPermissionTableColumnsExist(
  page: Page,
  assertions: [
    AssertionType,
    AssertionType,
    AssertionType,
    AssertionType,
    AssertionType,
  ],
) {
  const columns: { locator: Locator; assertion: AssertionType }[] = [
    {
      locator: page.getByRole("columnheader", {
        name: "View data",
        exact: true,
      }),
      assertion: assertions[0],
    },
    {
      locator: page.getByRole("columnheader", {
        name: "Create queries",
        exact: true,
      }),
      assertion: assertions[1],
    },
    {
      locator: page.getByRole("columnheader", { name: /Download results/ }),
      assertion: assertions[2],
    },
    {
      locator: page.getByRole("columnheader", {
        name: "Manage table metadata",
        exact: true,
      }),
      assertion: assertions[3],
    },
    {
      locator: page.getByRole("columnheader", {
        name: "Manage database",
        exact: true,
      }),
      assertion: assertions[4],
    },
  ];

  for (const { locator, assertion } of columns) {
    if (assertion === "exist") {
      await expect(locator).toHaveCount(1);
    } else {
      await expect(locator).toHaveCount(0);
    }
  }
}

/**
 * Port of the spec-local createTenantGroupFromUI. The `@createGroup` wait is
 * registered before the submitting click (PORTING rule 2).
 *
 * Upstream's "FIXME shouldn't be necessary - caused by slow route guard"
 * sidebar re-click is ported verbatim.
 */
export async function createTenantGroupFromUI(page: Page, groupName: string) {
  await page.goto("/admin/people/tenants/groups");

  // FIXME (upstream) shouldn't be necessary - caused by slow route guard
  await page
    .getByTestId("admin-layout-sidebar")
    .getByText(/Tenant groups/)
    .click();

  await expect(
    adminLayoutContent(page).getByRole("heading", { name: /Tenant groups/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create a group", exact: true }).click();
  await page.getByPlaceholder(/something like/i).fill(groupName);

  const createGroup = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/permissions/group" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await createGroup;
}

/**
 * Port of `H.popover().findByText(name).click()` for the tenant picker in the
 * create/edit user modal.
 */
export function tenantOption(page: Page, name: string): Locator {
  return popover(page).getByText(name, { exact: true });
}
