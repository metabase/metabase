/**
 * Playwright port of
 * e2e/test/scenarios/sharing/public-sharing-embed-button-behavior.cy.spec.js
 *
 * The "Embed" / sharing-button behaviour on questions and dashboards: whether
 * the embed button is enabled/disabled per public-sharing + embedding settings,
 * admin vs non-admin, and the OSS-vs-EE embed modal. Plus the legacy static
 * embedding modal and the (snowplow) copy/publish/unpublish flows.
 *
 * Porting notes:
 * - Snowplow (PORTING rule 6): the spike stubs snowplow, so resetSnowplow /
 *   enableTracking / expectNoBadSnowplowEvents / expectUnstructuredSnowplowEvent
 *   are no-op stubs (support/public-sharing-embed-button-behavior.ts). The
 *   "snowplow events" describes therefore still drive the real UI (open modal,
 *   copy, publish/unpublish) but assert nothing snowplow-specific.
 * - Clock (cy.clock) in the published/unpublished snowplow tests only existed to
 *   satisfy the stubbed `time_since_*` assertions; page.clock doesn't freeze time
 *   (PORTING) and the assertion is a no-op, so the clock is dropped and only the
 *   Publish/Unpublish UI actions are ported.
 * - Token: the "paid instance" Embed-JS test and the Pro/EE snowplow describe
 *   are skip-gated on resolveToken("pro-self-hosted") (activated on the jar).
 * - @OSS: the OSS Embed-JS test is skip-gated on isOssBackend (the spike/jar is
 *   EE). Its Cypress body declares a nested `it(...)` that never runs in Mocha —
 *   dead code, not ported as a separate test.
 * - Clipboard: the copy flows are given clipboard permissions and (for the
 *   non-admin copy test) a writeText stub so the copied value can be asserted,
 *   mirroring the Cypress `cy.stub(win.navigator.clipboard, "writeText")`.
 * - `should("have.attr","aria-label","Copy link")` is a real (non-boolean)
 *   attribute value → toHaveAttribute(name, value).
 */
import { isOssBackend } from "../support/admin";
import { resolveToken } from "../support/api";
import { tooltip } from "../support/charts";
import { pickEntity, selectDropdown } from "../support/dashboard";
import {
  embedModalContent,
  embedModalEnableEmbeddingCard,
  legacyStaticEmbeddingButton,
  openLegacyStaticEmbeddingModal,
} from "../support/embedding";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { startNewQuestion, visualize } from "../support/notebook";
import {
  openSharingMenu,
  sharingMenu,
  sharingMenuButton,
} from "../support/sharing";
import { modal, popover, visitDashboard } from "../support/ui";
import {
  type Resource,
  assertNonAdminCannotCreatePublicLink,
  assertValidPublicLink,
  createPublicResourceLink,
  createResource,
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  publishChanges,
  resetSnowplow,
  unpublishChanges,
  visitResource,
} from "../support/public-sharing-embed-button-behavior";

const RESOURCES: Resource[] = ["dashboard", "question"];

/**
 * The static-embedding appearance controls (theme SegmentedControl, the
 * title/border/background Switches, the download Switches) render as visually
 * hidden radio/checkbox inputs that Mantine positions outside the modal's
 * viewport — a real `click({ force: true })` fails ("outside of viewport").
 * Cypress's synthetic `.click({ force: true })` had no such constraint; the
 * faithful equivalent is a coordinate-free dispatched click.
 */
async function toggleAppearanceControl(
  page: import("@playwright/test").Page,
  label: string,
) {
  await modal(page).getByLabel(label, { exact: true }).dispatchEvent("click");
}

for (const resource of RESOURCES) {
  test.describe(`embed modal behavior for ${resource}s`, () => {
    let resourceId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      resourceId = await createResource(mb.api, resource);
    });

    test.describe("when embedding is disabled", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.api.updateSetting("enable-embedding-static", false);
      });

      test.describe("when user is admin", () => {
        test(`should always show the embed button for ${resource}`, async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);

          await openSharingMenu(page);
          const embedItem = sharingMenu(page).getByRole("menuitem", {
            name: "Embed",
            exact: true,
          });
          await expect(embedItem).toBeVisible();
          await expect(embedItem).toBeEnabled();
          await embedItem.click();

          await expect(embedModalContent(page)).toBeVisible();
        });
      });

      test.describe("when user is non-admin", () => {
        test(`should not show embed button for ${resource}`, async ({
          page,
          mb,
        }) => {
          await mb.signInAsNormalUser();

          await visitResource(page, mb.api, resource, resourceId);

          if (resource === "question") {
            // No public link: the share button copies directly, so there's no menu.
            await expect(sharingMenuButton(page)).toHaveAttribute(
              "aria-label",
              "Copy link",
            );
          }

          if (resource === "dashboard") {
            await openSharingMenu(page);
            await expect(
              sharingMenu(page).getByText(/embed/i),
            ).toHaveCount(0);
          }
        });
      });
    });

    test.describe("when embedding is enabled", () => {
      test.describe("when public sharing is enabled", () => {
        test.beforeEach(async ({ mb }) => {
          await mb.api.updateSetting("enable-public-sharing", true);
          await mb.api.updateSetting("enable-embedding-static", true);
        });

        test.describe("when user is admin", () => {
          test(`should show the embed menu for ${resource}`, async ({
            page,
            mb,
          }) => {
            await visitResource(page, mb.api, resource, resourceId);

            await openSharingMenu(page, "Embed");
            await expect(embedModalContent(page)).toBeVisible();
          });

          test(`should let the user create a public link for ${resource}`, async ({
            page,
            mb,
          }) => {
            await createPublicResourceLink(mb.api, resource, resourceId);
            await visitResource(page, mb.api, resource, resourceId);

            await openSharingMenu(page, /public link/i);

            await assertValidPublicLink(page, {
              resource,
              shouldHaveRemoveLink: true,
            });
          });
        });

        test.describe("when user is non-admin", () => {
          test(`should not prompt a non-admin to create a public link for a ${resource} without an existing link`, async ({
            page,
            mb,
          }) => {
            await mb.signInAsNormalUser();

            await visitResource(page, mb.api, resource, resourceId);

            await assertNonAdminCannotCreatePublicLink(page, resource);
          });

          test(`should let a non-admin copy the existing public link for a ${resource}`, async ({
            page,
            mb,
          }) => {
            await createPublicResourceLink(mb.api, resource, resourceId);

            await mb.signInAsNormalUser();

            await page
              .context()
              .grantPermissions(["clipboard-read", "clipboard-write"]);
            await page.addInitScript(() => {
              const w = window as unknown as { __copiedLinks: string[] };
              w.__copiedLinks = [];
              try {
                Object.defineProperty(navigator.clipboard, "writeText", {
                  configurable: true,
                  value: (text: string) => {
                    w.__copiedLinks.push(text);
                    return Promise.resolve();
                  },
                });
              } catch {
                // ignore — clipboard may be unavailable in some contexts
              }
            });

            await visitResource(page, mb.api, resource, resourceId);

            await openSharingMenu(page, "Copy public link");
            await expect(
              tooltip(page).getByText("Public link copied to clipboard", {
                exact: true,
              }),
            ).toBeVisible();

            const copied = await page.evaluate(
              () =>
                (window as unknown as { __copiedLinks: string[] }).__copiedLinks,
            );
            expect(copied[0]).toMatch(new RegExp(`/public/${resource}/`));

            await expect(
              page.getByTestId("public-link-popover-content"),
            ).toHaveCount(0);
          });
        });
      });

      test.describe("when public sharing is disabled", () => {
        test.beforeEach(async ({ mb }) => {
          await mb.api.updateSetting("enable-public-sharing", false);
          await mb.api.updateSetting("enable-embedding-static", true);
        });

        test.describe("when user is admin", () => {
          test(`should hide the public link option for ${resource} and allow the user to access the embed modal`, async ({
            page,
            mb,
          }) => {
            await visitResource(page, mb.api, resource, resourceId);

            await openSharingMenu(page);

            const menu = sharingMenu(page);
            await expect(menu.getByText(/public link/i)).toHaveCount(0);
            await expect(
              menu.getByText("Enable", { exact: true }),
            ).toHaveCount(0);

            await menu
              .getByRole("menuitem", { name: "Embed", exact: true })
              .click();
          });
        });

        test.describe("when user is non-admin", () => {
          test(`should not prompt a non-admin to create a public link for ${resource}`, async ({
            page,
            mb,
          }) => {
            await mb.signInAsNormalUser();

            await visitResource(page, mb.api, resource, resourceId);

            await assertNonAdminCannotCreatePublicLink(page, resource);
          });
        });
      });
    });
  });
}

test.describe("Embed JS modal display", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    dashboardId = await createResource(mb.api, "dashboard");
  });

  test.describe("when the user has a paid instance", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "needs the pro-self-hosted token",
    );

    test("should open Embed JS modal with the `enable simple embedding` card", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("pro-self-hosted");
      await visitDashboard(page, mb.api, dashboardId);

      await openSharingMenu(page, "Embed");

      await page.getByLabel("Metabase account (SSO)", { exact: true }).click();

      await expect(
        embedModalEnableEmbeddingCard(page).getByText(/modular embedding/),
      ).toBeVisible();
    });
  });

  test.describe("when the user has an OSS instance", () => {
    // @OSS upstream — the jar/spike backend is EE, so this skips there.
    test.beforeEach(async ({ mb }) => {
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS-tagged upstream: needs an OSS backend",
      );
    });

    test("should display a link to the product page for embedded analytics", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await visitDashboard(page, mb.api, dashboardId);
      await openSharingMenu(page, "Embed");

      // NOTE: the Cypress original declares a nested `it(...)` here ("should open
      // Embed JS modal with the `enable guest embedding` card") which never runs
      // in Mocha (nested test declarations are dead code) — not ported.
      await expect(embedModalContent(page)).toBeVisible();
    });
  });
});

test.describe("#39152 sharing an unsaved question", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", true);
  });

  test("should ask the user to save the question before creating a public link", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await pickEntity(page, {
      path: ["Databases", "Sample Database", "People"],
    });
    await visualize(page);

    await openSharingMenu(page);

    const saveModal = modal(page);
    await expect(
      saveModal.getByText("First, save your question", { exact: true }),
    ).toBeVisible();
    await saveModal.getByText("Save", { exact: true }).click();

    await openSharingMenu(page, "Create a public link");

    await assertValidPublicLink(page, {
      resource: "question",
      shouldHaveRemoveLink: true,
    });
  });
});

const LEGACY_RESOURCES = [
  { resource: "dashboard", apiPath: "dashboard" },
  { resource: "question", apiPath: "card" },
] as const;

for (const { resource, apiPath } of LEGACY_RESOURCES) {
  test.describe(`legacy static modal behavior for ${resource}`, () => {
    let resourceId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await enableTracking();
      resourceId = await createResource(mb.api, resource);
    });

    const EMBEDDING_TYPES = [
      { embeddingType: "guest-embed", shouldShowAlert: false },
      { embeddingType: "static-legacy", shouldShowAlert: true },
      { embeddingType: null, shouldShowAlert: true },
    ] as const;

    for (const { embeddingType, shouldShowAlert } of EMBEDDING_TYPES) {
      test(`should ${
        shouldShowAlert ? "show" : "not show"
      } legacy alert for ${embeddingType} embedding type`, async ({
        page,
        mb,
      }) => {
        await visitResource(page, mb.api, resource, resourceId);

        await mb.api.put(`/api/${apiPath}/${resourceId}`, {
          enable_embedding: true,
          embedding_type: embeddingType,
        });

        await openSharingMenu(page, "Embed");

        await expect(embedModalContent(page)).toBeVisible();

        if (shouldShowAlert) {
          await expect(legacyStaticEmbeddingButton(page)).toBeVisible();
        } else {
          await expect(legacyStaticEmbeddingButton(page)).toHaveCount(0);
        }
      });
    }

    test("should set a proper embedding_type", async ({ page, mb }) => {
      await visitResource(page, mb.api, resource, resourceId);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource,
        resourceId,
        activeTab: "parameters",
      });

      await publishChanges(page, apiPath, ({ request, response }) => {
        expect(request?.embedding_type).toBe("static-legacy");
        expect(response.embedding_type).toBe("static-legacy");
      });

      await modal(page).getByLabel("Price", { exact: true }).click();
      await selectDropdown(page).getByText("Editable", { exact: true }).click();

      await publishChanges(page, apiPath, ({ request, response }) => {
        expect(request?.embedding_type).toBe("static-legacy");
        expect(response.embedding_type).toBe("static-legacy");
      });

      await unpublishChanges(page, apiPath, ({ request, response }) => {
        expect(request?.embedding_type).toBeNull();
        expect(response.embedding_type).toBeNull();
      });
    });
  });

  test.describe(`public ${resource} sharing snowplow events`, () => {
    let resourceId: number;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await resetSnowplow();
      await mb.signInAsAdmin();
      await enableTracking();
      resourceId = await createResource(mb.api, resource);
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    test.describe(`when embedding ${resource}`, () => {
      test.describe("when interacting with public link popover", () => {
        test("should send `public_link_copied` event when copying public link", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);

          await openSharingMenu(page, /public link/i);
          await page.getByTestId("copy-button").first().click();
          if (resource === "dashboard") {
            await expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "dashboard",
              format: null,
            });
          }

          if (resource === "question") {
            await expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "html",
            });

            await popover(page).getByText("csv", { exact: true }).click();
            await page.getByTestId("copy-button").first().click();
            await expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "csv",
            });

            await popover(page).getByText("xlsx", { exact: true }).click();
            await page.getByTestId("copy-button").first().click();
            await expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "xlsx",
            });

            await popover(page).getByText("json", { exact: true }).click();
            await page.getByTestId("copy-button").first().click();
            await expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "json",
            });
          }
        });

        test("should send `public_link_removed` when removing the public link", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);

          await openSharingMenu(page, /public link/i);
          await popover(page)
            .getByRole("button", { name: "Remove public link" })
            .click();
          await expectUnstructuredSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-share",
          });
        });
      });

      test.describe("when interacting with public embedding", () => {
        test("should send `public_embed_code_copied` event when copying the public embed iframe", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);

          await openSharingMenu(page, "Create a public link");

          await page.getByTestId("copy-button").first().click();

          await expectUnstructuredSnowplowEvent({
            event: "public_link_copied",
            artifact: resource,
          });
        });

        test("should send `public_link_removed` event when removing the public embed", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);

          await openSharingMenu(page, "Create a public link");

          await popover(page)
            .getByText("Remove public link", { exact: true })
            .click();

          await expectUnstructuredSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-share",
          });
        });
      });

      test.describe("when interacting with static embedding", () => {
        test("should send `static_embed_code_copied` when copying the static embed code", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);
          await openLegacyStaticEmbeddingModal(page, mb.api, {
            resource,
            resourceId,
          });

          // Overview tab
          await page
            .getByTestId("embed-backend")
            .getByTestId("copy-button")
            .click();
          await page
            .getByTestId("embed-frontend")
            .getByTestId("copy-button")
            .click();
          await expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
          });

          // Parameters tab
          await modal(page)
            .getByRole("tab", { name: "Parameters", exact: true })
            .click();
          await (await findByDisplayValue(modal(page), "Node.js")).click();
          await selectDropdown(page).getByText("Ruby", { exact: true }).click();
          await page
            .getByTestId("embed-backend")
            .getByTestId("copy-button")
            .click();
          await expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
          });

          // Appearance (Look and Feel) tab
          await modal(page)
            .getByRole("tab", { name: "Look and Feel", exact: true })
            .click();
          await (await findByDisplayValue(modal(page), "Ruby")).click();
          await selectDropdown(page)
            .getByText("Python", { exact: true })
            .click();

          await toggleAppearanceControl(page, "Dark");
          if (resource === "dashboard") {
            await toggleAppearanceControl(page, "Dashboard title");
            await toggleAppearanceControl(page, "Dashboard border");
          }
          if (resource === "question") {
            await toggleAppearanceControl(page, "Question title");
            await toggleAppearanceControl(page, "Question border");
          }

          await page
            .getByTestId("embed-backend")
            .getByTestId("copy-button")
            .click();
          await expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
          });

          // Question doesn't have an option to disable background (metabase#43838)
          if (resource === "dashboard") {
            await toggleAppearanceControl(page, "Dashboard background");

            await page
              .getByTestId("embed-backend")
              .getByTestId("copy-button")
              .click();
            await expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
            });
          }
        });

        test.describe("Pro/EE instances", () => {
          test.skip(
            !resolveToken("pro-self-hosted"),
            "needs the pro-self-hosted token",
          );

          test.beforeEach(async ({ mb }) => {
            await mb.api.activateToken("pro-self-hosted");
          });

          test("should send `static_embed_code_copied` when copying the static embed code", async ({
            page,
            mb,
          }) => {
            await visitResource(page, mb.api, resource, resourceId);
            await openLegacyStaticEmbeddingModal(page, mb.api, {
              resource,
              resourceId,
            });

            // Overview tab
            await page
              .getByTestId("embed-backend")
              .getByTestId("copy-button")
              .click();
            await page
              .getByTestId("embed-frontend")
              .getByTestId("copy-button")
              .click();
            await expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
            });

            // Parameters tab
            await modal(page)
              .getByRole("tab", { name: "Parameters", exact: true })
              .click();
            await (await findByDisplayValue(modal(page), "Node.js")).click();
            await selectDropdown(page)
              .getByText("Ruby", { exact: true })
              .click();
            await page
              .getByTestId("embed-backend")
              .getByTestId("copy-button")
              .click();
            await expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
            });

            // Appearance (Look and Feel) tab
            await modal(page)
              .getByRole("tab", { name: "Look and Feel", exact: true })
              .click();
            await (await findByDisplayValue(modal(page), "Ruby")).click();
            await selectDropdown(page)
              .getByText("Python", { exact: true })
              .click();

            await toggleAppearanceControl(page, "Dark");
            if (resource === "dashboard") {
              await toggleAppearanceControl(page, "Dashboard title");
              await toggleAppearanceControl(page, "Dashboard border");
            }
            if (resource === "question") {
              await toggleAppearanceControl(page, "Question title");
              await toggleAppearanceControl(page, "Question border");
            }
            await modal(page).getByLabel("Font", { exact: true }).click();
            await popover(page).getByText("Oswald", { exact: true }).click();

            // Disable both download types
            await toggleAppearanceControl(
              page,
              resource === "dashboard"
                ? "Results (csv, xlsx, json, png)"
                : "Download (csv, xlsx, json, png)",
            );

            if (resource === "dashboard") {
              await toggleAppearanceControl(page, "Export to PDF");
            }

            await page
              .getByTestId("embed-backend")
              .getByTestId("copy-button")
              .click();
            await expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
            });
          });

          // Individual download options are only supported for dashboards
          if (resource === "dashboard") {
            test("should support disabling PDF and result downloads individually in `static_embed_code_copied`", async ({
              page,
              mb,
            }) => {
              await visitResource(page, mb.api, resource, resourceId);
              await openLegacyStaticEmbeddingModal(page, mb.api, {
                resource: "dashboard",
                resourceId,
              });

              await modal(page)
                .getByRole("tab", { name: "Look and Feel", exact: true })
                .click();

              // Disable PDF exports
              await toggleAppearanceControl(page, "Export to PDF");

              await page
                .getByTestId("embed-backend")
                .getByTestId("copy-button")
                .click();
              await expectUnstructuredSnowplowEvent({
                event: "static_embed_code_copied",
              });

              // Enable PDF exports again
              await toggleAppearanceControl(page, "Export to PDF");

              // Disable results download
              await toggleAppearanceControl(page, "Results (csv, xlsx, json, png)");

              await page
                .getByTestId("embed-backend")
                .getByTestId("copy-button")
                .click();
              await expectUnstructuredSnowplowEvent({
                event: "static_embed_code_copied",
              });
            });
          }
        });

        test("should send `static_embed_discarded` when discarding changes in the static embed modal", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);
          await openLegacyStaticEmbeddingModal(page, mb.api, {
            resource,
            resourceId,
            activeTab: "parameters",
          });

          await publishChanges(page, apiPath);

          // changing parameters, so we could discard changes
          await modal(page).getByLabel("Price", { exact: true }).click();
          await selectDropdown(page)
            .getByText("Editable", { exact: true })
            .click();

          await page
            .getByTestId("embed-modal-content-status-bar")
            .getByText("Discard changes", { exact: true })
            .click();

          await expectUnstructuredSnowplowEvent({
            event: "static_embed_discarded",
            artifact: resource,
          });
        });

        test("should send `static_embed_published` when publishing changes in the static embed modal", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);
          await openLegacyStaticEmbeddingModal(page, mb.api, {
            resource,
            resourceId,
          });

          await page
            .getByTestId("embed-modal-content-status-bar")
            .getByRole("button", { name: "Publish", exact: true })
            .click();

          await expectUnstructuredSnowplowEvent({
            event: "static_embed_published",
            artifact: resource,
          });

          await page
            .getByTestId("embed-modal-content-status-bar")
            .getByRole("button", { name: "Unpublish", exact: true })
            .click();

          await modal(page)
            .getByRole("tab", { name: "Parameters", exact: true })
            .click();
          await modal(page).getByLabel("Price", { exact: true }).click();
          await selectDropdown(page)
            .getByText("Editable", { exact: true })
            .click();

          await modal(page).getByLabel("Category", { exact: true }).click();
          await selectDropdown(page)
            .getByText("Locked", { exact: true })
            .click();

          await page
            .getByTestId("embed-modal-content-status-bar")
            .getByRole("button", { name: "Publish", exact: true })
            .click();

          await expectUnstructuredSnowplowEvent({
            event: "static_embed_published",
            artifact: resource,
          });
        });

        test("should send `static_embed_unpublished` when unpublishing changes in the static embed modal", async ({
          page,
          mb,
        }) => {
          await visitResource(page, mb.api, resource, resourceId);
          await openLegacyStaticEmbeddingModal(page, mb.api, {
            resource,
            resourceId,
          });

          await publishChanges(page, apiPath);

          await page
            .getByTestId("embed-modal-content-status-bar")
            .getByText("Unpublish", { exact: true })
            .click();

          await expectUnstructuredSnowplowEvent({
            event: "static_embed_unpublished",
            artifact: resource,
          });
        });
      });
    });
  });
}
