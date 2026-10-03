/**
 * Port of e2e/test/scenarios/embedding/tenant-users-sidecar.cy.spec.ts
 *
 * Tenant users given an SSO login into the internal Metabase instance (the
 * "sidecar" flow): the embedding data picker, a flattened collection sidebar,
 * the read-only "Our data" tenant collection, and the absence of git-sync
 * (synced-collection) affordances for tenant users.
 *
 * EE token gate — tenants, JWT SSO and remote-sync are all EE. The jar
 * activates the token from cypress.env.json (pro-self-hosted).
 *
 * Notes on the port:
 * - `cy.task("signJwt")` → the local HS256 `signJwt` (support/interactive-embedding),
 *   with an explicit `iat` because upstream's `jsonwebtoken` adds one and the
 *   backend unsigns with a max-age. The `/auth/sso` redirect is the app's own,
 *   so `page.goto` follows it natively (no mocked redirect, so the
 *   "Playwright does not route the follow-up of a redirect" gotcha is moot).
 * - `H.setupGitSync` / `H.LOCAL_GIT_PATH` → the temp-repo form in
 *   support/remote-sync.ts (`repo.url` is already the `file://…/.git` URL that
 *   upstream builds as `H.LOCAL_GIT_PATH + "/.git"`), plus a teardown upstream
 *   does not have.
 * - `.closest("li")` / `.closest("a")` → innermost-ancestor `filter({has}).last()`
 *   (see support/tenant-users-sidecar.ts).
 * - `findByText(str)` string args → exact; `H.popover().contains(str)` →
 *   case-sensitive substring regex, `.first()` (PORTING rule 1).
 * - The `should("not.exist")` checks are all preceded by a retrying positive
 *   assertion that gates the render, so porting them as retrying
 *   `toHaveCount(0)` is safe rather than vacuous.
 * - Snowplow: not used by this spec at all — nothing stubbed, nothing captured.
 */
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { entityPickerModal } from "../support/notebook";
import { main, modal, navigationSidebar, newButton, popover } from "../support/ui";
import {
  type RemoteSyncRepo,
  commitToRepo,
  copySyncedCollectionFixture,
  createSharedTenantCollection,
  setupGitSync,
  teardownGitSync,
} from "../support/remote-sync";
import {
  GIZMO_TENANT,
  GIZMO_USER,
  JWT_SHARED_SECRET,
  createTenant,
  expectIconVisible,
  loginWithJWT,
  pickerRowLink,
  sidebarCollectionItem,
} from "../support/tenant-users-sidecar";

// EE token gate — tenants + JWT SSO + remote sync are EE features.
test.skip(
  !resolveToken("pro-self-hosted"),
  "requires the pro-self-hosted token",
);

// Tests for when a tenant user is given SSO logins to
// login to the internal Metabase instances, aka sidecar.
test.describe("scenarios > sidecar > tenant users", () => {
  let sharedCollection1Id: number;
  let sharedCollection2Id: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await mb.api.put("/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SHARED_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    await createTenant(mb.api, GIZMO_TENANT);

    ({ id: sharedCollection1Id } = await createSharedTenantCollection(
      mb.api,
      "Shared tenant collection 1",
    ));
    ({ id: sharedCollection2Id } = await createSharedTenantCollection(
      mb.api,
      "Shared tenant collection 2",
    ));
  });

  test("should show the embedding data picker when logged in as a tenant user (metabase#EMB-1144)", async ({
    page,
  }) => {
    // log in as tenant user
    await loginWithJWT(page, GIZMO_USER, "/question/notebook");

    // embedding data picker is shown
    await expect(
      page.getByTestId("embedding-simple-data-picker-trigger"),
    ).toBeVisible();
    await expect(popover(page).getByText(/Orders/).first()).toBeVisible();
    await expect(popover(page).getByText(/People/).first()).toBeVisible();
  });

  test("tenant users should see a flatten view of collections", async ({
    page,
  }) => {
    await loginWithJWT(page, GIZMO_USER);

    const sidebar = navigationSidebar(page);
    await expect(
      sidebar.getByText("Collections", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("Shared tenant collection 1", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("Shared tenant collection 2", { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Our data", { exact: true })).toBeVisible();

    // No "internal/external" naming or sections
    await expect(sidebar.getByText(/External collections/)).toHaveCount(0);
    await expect(sidebar.getByText(/Internal collections/)).toHaveCount(0);
  });

  test("the tenant collection should be called 'Our data' and be read only", async ({
    page,
  }) => {
    /*
      The "Our data" comes from both on the FE and the BE depending on the place it's used.
      This test checks a few places to make sure everything is working as expected.
    */
    await loginWithJWT(page, GIZMO_USER);

    const ourData = navigationSidebar(page).getByText("Our data", {
      exact: true,
    });
    await expect(ourData).toBeVisible();
    await ourData.click();
    await expect.poll(() => new URL(page.url()).pathname).toContain(
      "/collection/",
    );

    // Check the collection name on the collection page, it should be read only
    const heading = page.getByTestId("collection-name-heading");
    await expect(heading).toHaveText("Our data");
    await expect(heading).toBeDisabled();

    // Check the save modal
    await main(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await popover(page).getByText("Orders", { exact: true }).click();
    await main(page).getByText("Save", { exact: true }).click();

    // Check the entity picker modal
    const pickerButton = modal(page).getByLabel(
      /Where do you want to save this/,
    );
    await expect(pickerButton).toHaveText("Our data");
    await pickerButton.click();

    await expect(
      entityPickerModal(page).getByText("Our data", { exact: true }),
    ).toBeVisible();
  });

  test("tenant users should not see the synced collection icons", async ({
    page,
    mb,
  }) => {
    // Already signed in as admin by the beforeEach (upstream re-signs here).
    let repo: RemoteSyncRepo | undefined;
    try {
      // Setup git sync
      repo = setupGitSync();
      copySyncedCollectionFixture(repo);
      commitToRepo(repo);

      // Make shared tenant collections synced
      await mb.api.put("/api/ee/remote-sync/settings", {
        collections: {
          [sharedCollection1Id]: true,
          [sharedCollection2Id]: true,
        },
        "remote-sync-branch": "main",
        "remote-sync-type": "read-write",
        "remote-sync-url": repo.url,
        "remote-sync-enabled": true,
      });

      await mb.signOut();

      await loginWithJWT(page, GIZMO_USER);

      // Check sidebar
      const collection1Item = sidebarCollectionItem(
        page,
        "Shared tenant collection 1",
      );
      // Synced collections should show a regular folder icon for tenant users
      await expectIconVisible(collection1Item, "folder");
      await expect(
        collection1Item.locator(".Icon-synced_collection"),
      ).toHaveCount(0);

      // Check picker
      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await popover(page).getByText("Orders", { exact: true }).click();
      await main(page).getByText("Save", { exact: true }).click();
      await modal(page)
        .getByLabel(/Where do you want to save this/)
        .click();

      const picker = entityPickerModal(page);
      await picker.getByText("Shared collections", { exact: true }).click();

      await expectIconVisible(
        pickerRowLink(page, picker, "Shared tenant collection 1"),
        "folder",
      );
    } finally {
      teardownGitSync(repo);
    }
  });
});
