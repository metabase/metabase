/**
 * Spec-local helpers for tenant-users-sidecar.spec.ts (port of
 * e2e/test/scenarios/embedding/tenant-users-sidecar.cy.spec.ts).
 *
 * The Cypress spec keeps one module-local helper (`loginWithJWT`) plus its
 * tenant/tenant-user fixtures; everything else it uses comes from shared `H`
 * helpers, which the spec imports directly from the consolidated support
 * modules (ui.ts, notebook.ts, remote-sync.ts).
 *
 * Per PORTING rule 9 this is a NEW module — it only imports read-only from the
 * shared modules and edits none of them.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { signJwt } from "./interactive-embedding";
import { JWT_SHARED_SECRET } from "./sdk-iframe";
import { navigationSidebar } from "./ui";

export { JWT_SHARED_SECRET };

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

export const GIZMO_USER: TenantUser = {
  first_name: "gizmo",
  last_name: "user",
  email: "gizmo.user@email.com",
  "@tenant": GIZMO_TENANT.slug,
};

/**
 * Port of the spec-local `loginWithJWT`: sign a JWT for the tenant user and
 * navigate to the backend's real `/auth/sso` endpoint, which provisions the
 * user (jwt-user-provisioning-enabled?), issues a session cookie and redirects
 * to `return_to`.
 *
 * Nothing is mocked here — the redirect is the app's own — so the
 * "Playwright does not route the follow-up request of a redirect" gotcha does
 * not apply; a plain `page.goto` follows it natively.
 *
 * `iat` is set explicitly because upstream signs via `jsonwebtoken`
 * (`e2e/support/helpers/e2e-jwt-tasks.ts`), which stamps `iat` automatically,
 * and the backend unsigns with `{:max-age three-minutes-in-seconds}`
 * (`sso/providers/jwt.clj`). The bare `signJwt` port does not add claims.
 */
export async function loginWithJWT(
  page: Page,
  user: TenantUser,
  returnTo = "/",
): Promise<void> {
  const token = signJwt(
    { ...user, iat: Math.floor(Date.now() / 1000) },
    JWT_SHARED_SECRET,
  );
  await page.goto(
    `/auth/sso?return_to=${encodeURIComponent(returnTo)}&jwt=${token}`,
  );
}

/** Port of `cy.request("POST", "/api/ee/tenant", tenant)`. */
export async function createTenant(
  api: MetabaseApi,
  tenant: Tenant,
): Promise<void> {
  await api.post("/api/ee/tenant", tenant);
}

/**
 * Port of `cy.findByText(name).closest("li")` inside the navigation sidebar.
 *
 * Playwright has no `closest`, and the sidebar tree nests `<li>`s, so a
 * `filter({ has })` matches the whole ancestor chain. Matches come back in
 * document order (outermost first), so `.last()` is the innermost `<li>` —
 * exactly what `closest("li")` returns.
 *
 * The `has` text locator is built from `page`, never from the scope locator
 * (PORTING wave-11 gotcha: a scope-built `has` gets re-anchored and never
 * resolves).
 */
export function sidebarCollectionItem(page: Page, name: string): Locator {
  return navigationSidebar(page)
    .locator("li")
    .filter({ has: page.getByText(name, { exact: true }) })
    .last();
}

/**
 * Port of `cy.findByText(name).closest("a")` inside the entity picker: the
 * innermost anchor wrapping the picker row. Same `closest` reasoning as
 * `sidebarCollectionItem`.
 */
export function pickerRowLink(
  page: Page,
  scope: Locator,
  name: string,
): Locator {
  return scope
    .locator("a")
    .filter({ has: page.getByText(name, { exact: true }) })
    .last();
}

/**
 * Port of `cy.icon(name).should("be.visible")`.
 *
 * `cy.icon(...).should("be.visible")` is an ANY-of-set assertion (PORTING
 * rule 3), so filter to the visible matches and take the first rather than
 * strengthening it to "the first match is visible".
 */
export async function expectIconVisible(
  scope: Locator,
  name: string,
): Promise<void> {
  await expect(
    scope.locator(`.Icon-${name}`).filter({ visible: true }).first(),
  ).toBeVisible();
}
