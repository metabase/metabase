/**
 * Playwright port of
 * e2e/test/scenarios/documents/document-downloads.cy.spec.ts
 *
 * The document view embeds saved cards; each embedded card has an ellipsis
 * menu whose "Download results" item depends on the viewer's collection and
 * download permissions. These tests exercise that menu — they assert the menu
 * item's presence/enabled state and that the format options (.csv/.xlsx/.json)
 * appear, not an actual file download.
 *
 * Notes:
 * - All helpers already exist and are imported read-only: createDocument /
 *   visitDocument / getDocumentCard / openDocumentCardMenu / documentContent
 *   (support/documents-core), DOCUMENT_WITH_TWO_CARDS (support/card-embed-node),
 *   updatePermissionsGraph (support/dashboard-repros), popover (support/ui).
 *   No new document-downloads.ts module was needed.
 * - Test 1's per-item `.each(...).should("be.disabled"/"not.be.disabled")` is a
 *   per-element assertion (NOT the any-of-set case) — ported as a per-item loop
 *   over the menuitems, mirroring the working pattern in documents.spec.ts.
 * - Menu-item enabled/disabled: Mantine renders these as buttons; toBeEnabled /
 *   toBeDisabled reads the disabled state faithfully (same as documents.spec.ts).
 * - "nocollection" has a cached session but isn't in the USERS credential map,
 *   hence the widening cast (same as documents.spec.ts).
 * - EE download-permissions test (test 4) activates the pro-self-hosted token,
 *   which the jar provides; it skips when the token is unavailable (rule 7).
 */
import { DOCUMENT_WITH_TWO_CARDS } from "../support/card-embed-node";
import { resolveToken } from "../support/api";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import {
  createDocument,
  documentContent,
  getDocumentCard,
  openDocumentCardMenu,
  visitDocument,
  type DocumentContent,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DB_ID, type UserName } from "../support/sample-data";
import { popover } from "../support/ui";

// Mirrors USER_GROUPS (e2e/support/cypress_data.js) — fixed ids baked into the
// `default` snapshot.
const ALL_USERS_GROUP = 1;
const READONLY_GROUP = 7;

test.describe("scenarios > documents > downloads", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows Download results for read-only document access", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS as DocumentContent,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for card to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Sign in as read-only user
    await mb.signIn("readonly");
    await visitDocument(page, doc.id);

    // Wait for card to load as readonly user
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Open card menu
    await openDocumentCardMenu(page, "Orders");

    // Verify menu shows only "Download results" and it's enabled
    const menu = popover(page);
    await expect(
      menu.getByRole("menuitem", { name: /Download results/i }),
    ).toBeVisible();

    // Verify all menu items: only Download results should be enabled
    const menuItems = menu.getByRole("menuitem");
    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const item = menuItems.nth(i);
      if (((await item.textContent()) ?? "").includes("Download results")) {
        await expect(item).toBeEnabled();
      } else {
        await expect(item).toBeDisabled();
      }
    }

    // Click Download results
    await menu.getByRole("menuitem", { name: /Download results/i }).click();

    // Verify format options appear
    await expect(popover(page).getByText(".csv", { exact: true })).toBeVisible();
    await expect(
      popover(page).getByText(".xlsx", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText(".json", { exact: true }),
    ).toBeVisible();
  });

  test("shows full menu including Download results for write access", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Admin Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS as DocumentContent,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for card to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Open card menu
    await openDocumentCardMenu(page, "Orders");

    // Verify menu shows all options with Download results
    const menu = popover(page);
    await expect(
      menu.getByRole("menuitem", { name: /Edit Query/i }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Edit Visualization/i }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Replace/i })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Download results/i }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Remove Chart/i }),
    ).toBeVisible();

    // Click Download results
    await menu.getByRole("menuitem", { name: /Download results/i }).click();

    // Verify format options appear
    await expect(popover(page).getByText(".csv", { exact: true })).toBeVisible();
    await expect(
      popover(page).getByText(".xlsx", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText(".json", { exact: true }),
    ).toBeVisible();
  });

  test("does not show download when permissions are 'none'", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "No Access Document",
      document: DOCUMENT_WITH_TWO_CARDS as DocumentContent,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for card to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Sign in as user with no collection access
    await mb.signIn("nocollection" as UserName);
    await visitDocument(page, doc.id);

    // Should see permission denied message
    await expect(page.getByRole("status")).toContainText(
      "Sorry, you don’t have permission to see that.",
    );

    // Document content should not render and no card menu should be visible
    await expect(documentContent(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /ellipsis/ }),
    ).toHaveCount(0);
  });

  test("hides Download results when the person lacks download permission but can view the collection", async ({
    page,
    mb,
  }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "EE download permissions require the pro-self-hosted token",
    );
    await mb.api.activateToken("pro-self-hosted");

    const doc = await createDocument(mb.api, {
      name: "No Download Permission Document",
      document: DOCUMENT_WITH_TWO_CARDS as DocumentContent,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for card to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Remove download permission but keep view-data unrestricted
    await updatePermissionsGraph(mb.api, {
      [READONLY_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
          "view-data": "unrestricted",
        },
      },
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });

    // Sign in as read-only user who can view the collection but cannot download
    await mb.signIn("readonly");
    await visitDocument(page, doc.id);

    // Wait for card to load as readonly user
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Open card menu
    await openDocumentCardMenu(page, "Orders");

    // Verify that Download results is not shown
    await expect(
      popover(page).getByRole("menuitem", { name: /Download results/i }),
    ).toHaveCount(0);
  });
});
