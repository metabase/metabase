/**
 * Playwright port of e2e/test/scenarios/data-apps/sync.cy.spec.ts
 *
 * Drives a real remote-sync pull of a repo whose `data_apps/` covers every
 * materialization outcome, and asserts each is handled the way the backend
 * intends:
 *   good/          valid config + bundle        -> materialized, served
 *   broken-bundle/ valid config, missing bundle -> row with "Sync failed", not served
 *   bad-config/    malformed data_app.yaml       -> skipped, no row
 *   no-config/     a bundle but no data_app.yaml -> not discovered, no row
 *
 * Infra tier: EE-token only. Like support/remote-sync.ts's admin/read-only
 * describes, the git remote is a LOCAL file:// repo created in-process (no
 * external git server, no QA DB), so this runs on the EE jar once the
 * `bleeding-edge` token (which grants the `data-apps` premium feature) is
 * active. Gated with test.skip(!resolveToken("bleeding-edge"), ...).
 *
 * Port notes:
 * - H.setupGitSync / copySyncedCollectionFixture / commitToRepo /
 *   configureGitAndPullChanges reuse support/remote-sync.ts (already ported;
 *   each test gets its own throwaway $TMPDIR repo). copySyncedDataAppsFixture
 *   is added in support/data-apps.ts.
 * - cy.exec("rm -rf …/data_apps/good") → fs.rmSync (the repo path is the
 *   throwaway repo, not the fixed e2e/tmp/test-repo the Cypress helper used).
 * - cy.request(...) assertions → mb.api.get with failOnStatusCode:false, then
 *   status/body checks. The 404 bodies are compared exactly (upstream deep-eqs
 *   an object for broken-bundle and the string "Not found." for the others).
 * - findByText(/^Synced/) stays a regex; findByRole/ findByText with string
 *   args are exact (rule 1).
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

import { resolveToken } from "../support/api";
import { copySyncedDataAppsFixture } from "../support/data-apps";
import { expect, test } from "../support/fixtures";
import {
  type RemoteSyncRepo,
  commitToRepo,
  configureGitAndPullChanges,
  copySyncedCollectionFixture,
  setupGitSync,
  teardownGitSync,
} from "../support/remote-sync";
import { main } from "../support/ui";

/** Read a response body the way Cypress does: JSON when parseable, else text. */
async function readBody(response: {
  text: () => Promise<string>;
}): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

test.describe("scenarios > data apps > repo sync", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires the bleeding-edge (MB_ALL_FEATURES_TOKEN) token, which grants the data-apps premium feature",
  );

  let repo: RemoteSyncRepo | undefined;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
    repo = setupGitSync();
  });

  test.afterEach(() => {
    teardownGitSync(repo);
    repo = undefined;
  });

  test("materializes each app per its config/bundle, isolating the broken ones", async ({
    page,
    mb,
  }) => {
    copySyncedCollectionFixture(repo!);
    copySyncedDataAppsFixture(repo!);
    commitToRepo(repo!, "Add data apps with mixed config/bundle states");

    await configureGitAndPullChanges(mb.api, repo!, "read-write");

    await page.goto("/admin/settings/apps");
    const content = page.getByTestId("admin-layout-content");

    // The good app is materialized and shown as synced. Scope to its own row so
    // its status can't be satisfied by another app's.
    const good = content.getByTestId("data-app-list-item-good");
    await good.scrollIntoViewIfNeeded();
    await expect(
      good.getByRole("link", { name: "Good App", exact: true }),
    ).toBeVisible();
    await expect(good.getByText(/^Synced/)).toBeVisible();

    // The app whose bundle is missing still appears — with its failure, not
    // hidden. Its name is plain text, not a link: a sync-failed app can't open.
    const broken = content.getByTestId("data-app-list-item-broken-bundle");
    await broken.scrollIntoViewIfNeeded();
    await expect(
      broken.getByText("Broken Bundle", { exact: true }),
    ).toBeVisible();
    await expect(
      broken.getByRole("link", { name: "Broken Bundle", exact: true }),
    ).toHaveCount(0);
    await expect(broken.getByText("Sync failed", { exact: true })).toBeVisible();

    // The malformed config and the config-less directory produced no app at all.
    await expect(
      content.getByText("/apps/bad-config", { exact: true }),
    ).toHaveCount(0);
    await expect(
      content.getByText("/apps/no-config", { exact: true }),
    ).toHaveCount(0);

    // The API tells the same story: exactly the two apps, only the good one serves.
    const appsRes = await mb.api.get("/api/apps");
    const apps = (await appsRes.json()) as { name: string }[];
    expect(apps.map((app) => app.name).sort()).toEqual([
      "broken-bundle",
      "good",
    ]);

    const goodBundle = await mb.api.get("/api/apps/good/bundle");
    expect(goodBundle.status()).toBe(200);

    const brokenBundle = await mb.api.get("/api/apps/broken-bundle/bundle", {
      failOnStatusCode: false,
    });
    expect(brokenBundle.status()).toBe(404);
    expect(await readBody(brokenBundle)).toEqual({
      error: "Bundle not synced yet",
    });

    for (const slug of ["bad-config", "no-config"]) {
      const res = await mb.api.get(`/api/apps/${slug}/bundle`, {
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(404);
      expect(await readBody(res)).toEqual("Not found.");
    }

    // What a user opening the broken app sees: its metadata loads (the app
    // exists), the host frames it, and the bundle 404 surfaces as the
    // "isn't ready yet" screen — driven by the real pull, no mocks.
    await page.goto("/apps/broken-bundle");
    await expect(
      main(page).getByText(/isn.t ready yet/i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("prunes an app whose directory is removed from the repo on the next sync", async ({
    page,
    mb,
  }) => {
    copySyncedCollectionFixture(repo!);
    copySyncedDataAppsFixture(repo!);
    commitToRepo(repo!, "Add data apps");
    await configureGitAndPullChanges(mb.api, repo!, "read-write");

    // Both apps are materialized from the first pull.
    const firstRes = await mb.api.get("/api/apps");
    const first = (await firstRes.json()) as { name: string }[];
    expect(first.map((app) => app.name).sort()).toEqual([
      "broken-bundle",
      "good",
    ]);

    // Delete the good app's directory from the repo and sync again. The
    // connected repo is the source of truth, so the app must be pruned.
    rmSync(join(repo!.path, "data_apps/good"), {
      recursive: true,
      force: true,
    });
    commitToRepo(repo!, "Remove the good app from the repo");
    await configureGitAndPullChanges(mb.api, repo!, "read-write");

    // `good` is gone; `broken-bundle` (still in the repo) survives.
    const secondRes = await mb.api.get("/api/apps");
    const second = (await secondRes.json()) as { name: string }[];
    expect(second.map((app) => app.name)).toEqual(["broken-bundle"]);

    const goodRes = await mb.api.get("/api/apps/good", {
      failOnStatusCode: false,
    });
    expect(goodRes.status()).toBe(404);

    // The admin list reflects the removal.
    await page.goto("/admin/settings/apps");
    const content = page.getByTestId("admin-layout-content");
    await expect(
      content.getByTestId("data-app-list-item-broken-bundle"),
    ).toBeVisible();
    await expect(
      content.getByTestId("data-app-list-item-good"),
    ).toHaveCount(0);
  });
});
