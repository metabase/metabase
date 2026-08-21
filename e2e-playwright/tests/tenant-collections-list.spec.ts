/**
 * Playwright port of
 * e2e/test/scenarios/collections/tenant-collections-list.cy.spec.ts
 *
 * The /collection/tenant-specific page: it lists one collection per active
 * tenant, each a link into that tenant's collection, and hides deactivated
 * tenants.
 *
 * Port notes:
 * - EE: `H.activateToken("pro-self-hosted")` + `use-tenants` → gated with
 *   `test.skip(!resolveToken(...))` (PORTING rule 7).
 * - Upstream writes the setting through the BULK endpoint
 *   (`cy.request("PUT", "/api/setting", { "use-tenants": true })`), not
 *   `/api/setting/:key` — ported literally.
 * - Tenants are created with a bare `POST /api/ee/tenant` exactly as upstream;
 *   `support/tenant-users-sidecar.ts createTenant` returns void and test 2
 *   needs the created tenant's id, so the raw call is kept (and shared modules
 *   stay untouched).
 * - `findByText(string)` is an exact match in testing-library → `{ exact: true }`
 *   (rule 1). `cy.url().should("include"/"not.include")` retries → expect.poll.
 * - The "not.exist" check in test 2 is anchored on the *active* tenant being
 *   visible first, so it cannot pass on an unrendered page (proved by
 *   inversion — see the mutation notes in findings).
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import { main } from "../support/ui";

interface Tenant {
  name: string;
  slug: string;
}

test.describe("scenarios > collections > tenant collections list", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "tenants are an EE feature — requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.put("/api/setting", { "use-tenants": true });
  });

  test("should display tenant collections", async ({ page, mb }) => {
    const tenants: Tenant[] = Array.from({ length: 3 }, (_, i) => ({
      name: `Tenant ${String(i + 1).padStart(2, "0")}`,
      slug: `tenant-${String(i + 1).padStart(2, "0")}`,
    }));

    // creating multiple tenants
    for (const tenant of tenants) {
      await mb.api.post("/api/ee/tenant", tenant);
    }

    await page.goto("/collection/tenant-specific");

    // all tenant collections are displayed
    for (const tenant of tenants) {
      await expect(
        main(page).getByText(tenant.name, { exact: true }),
      ).toBeVisible();
    }

    // all collections should be clickable links
    await expect
      .poll(() => page.getByRole("link").count())
      .toBeGreaterThanOrEqual(tenants.length);

    // can navigate to tenant collection
    await main(page).getByText("Tenant 01", { exact: true }).click();
    await expect.poll(() => page.url()).toContain("/collection/");
    await expect
      .poll(() => page.url())
      .not.toContain("/collection/tenant-specific");
    await expect(
      main(page).getByText("Tenant collection: Tenant 01", { exact: true }),
    ).toBeVisible();
  });

  test("does not show deactivated tenants", async ({ page, mb }) => {
    // create active tenant
    await mb.api.post("/api/ee/tenant", {
      name: "Active Tenant",
      slug: "active-tenant",
    });

    // create tenant to be deactivated
    const tenant = (await (
      await mb.api.post("/api/ee/tenant", {
        name: "Deactivated Tenant",
        slug: "deactivated-tenant",
      })
    ).json()) as { id: number };

    // deactivate the tenant
    await mb.api.put(`/api/ee/tenant/${tenant.id}`, { is_active: false });

    await page.goto("/collection/tenant-specific");

    // active tenant should be visible
    await expect(
      main(page).getByText("Active Tenant", { exact: true }),
    ).toBeVisible();

    // deactivated tenant should not be visible
    await expect(
      main(page).getByText("Deactivated Tenant", { exact: true }),
    ).toHaveCount(0);
  });
});
