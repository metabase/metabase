/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-theme-editor/theme-editor.cy.spec.ts —
 * the static-embedding appearance/theme editor (/admin/embedding/themes/:id):
 * theme name, main + additional colors, font family/size, delete flow, and the
 * live-preview panel/resource picker.
 *
 * Porting notes:
 * - EE + token-gated: the whole describe is skipped without a pro-self-hosted
 *   token; the jar activates it in beforeEach (H.activateToken).
 * - findByText / findByLabelText string args are exact (rule 1); the /Save theme/
 *   style role names stay regexes (upstream used regex → substring).
 * - The `settings.colors.brand === "#ff0000ff"` assertions read the PUT request
 *   body, not rendered pixels — deterministic JS (the `color` lib), so no
 *   Chromium-vs-Chrome concern.
 * - Save PUTs then navigates to the theme list, so the "@updateTheme" wait is
 *   registered before the Save click (rule 2) and its body read from the request.
 * - undoToastList().contains("Theme saved") → filter+.first() (an earlier toast
 *   may linger — the upstream comment says as much; also the transient-UI
 *   strict-mode rule).
 * - Mantine Font Select: open, then click the role="option" (option rows aren't
 *   directly clickable). Options portal outside main(), so pick from page.
 * - New helpers live in support/embedding-theme-editor.ts.
 */
import { resolveToken } from "../support/api";
import {
  changeColor,
  createThemeViaApi,
  visitThemeEditor,
} from "../support/embedding-theme-editor";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { entityPickerModal } from "../support/notebook";
import { undoToastList } from "../support/organization";
import { main } from "../support/ui";

test.describe("scenarios > embedding > themes > theme editor", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("loads the theme editor page and shows the theme name", async ({
    page,
    mb,
  }) => {
    const theme = await createThemeViaApi(mb.api, "My custom theme");
    await visitThemeEditor(page, theme.id);

    // editor panel should show the theme name
    await expect(page.getByLabel("Theme name")).toHaveValue("My custom theme");

    // sidebar should be hidden on theme editor page
    await expect(page.getByTestId("admin-layout-sidebar")).toHaveCount(0);

    // save button should be disabled when no changes
    await expect(
      page.getByRole("button", { name: /Save theme/ }),
    ).toBeDisabled();
  });

  test("can edit and save a theme name", async ({ page, mb }) => {
    const theme = await createThemeViaApi(mb.api, "Original name");
    await visitThemeEditor(page, theme.id);

    // change the theme name
    await page.getByLabel("Theme name").fill("Updated name");

    // save button should be enabled
    await expect(page.getByRole("button", { name: /Save theme/ })).toBeEnabled();

    // save the theme
    await page.getByRole("button", { name: /Save theme/ }).click();

    await expect(
      undoToastList(page).filter({ hasText: "Theme saved" }).first(),
    ).toBeVisible();
  });

  test("can cancel and navigate back to listing", async ({ page, mb }) => {
    const theme = await createThemeViaApi(mb.api, "A theme");
    await visitThemeEditor(page, theme.id);

    await page.getByRole("button", { name: /Cancel/ }).click();

    // should navigate back to the themes listing
    await expect.poll(() => page.url()).toContain("/admin/embedding/themes");
    await expect.poll(() => page.url()).not.toMatch(/\/themes\/\d+/);
  });

  test("shows not found for invalid theme id", async ({ page }) => {
    await page.goto("/admin/embedding/themes/99999");

    await expect(
      main(page).getByText("We're a little lost...", { exact: true }),
    ).toBeVisible();
  });

  test("can delete the theme from the editor with confirmation", async ({
    page,
    mb,
  }) => {
    const theme = await createThemeViaApi(mb.api, "Theme to delete");
    await visitThemeEditor(page, theme.id);

    // delete button should be visible
    const deleteButton = page.getByRole("button", { name: /Delete theme/ });
    await deleteButton.scrollIntoViewIfNeeded();
    await expect(deleteButton).toBeVisible();

    // open the delete confirmation modal
    await deleteButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Delete theme", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        "Are you sure you want to delete this theme? This action cannot be undone.",
        { exact: true },
      ),
    ).toBeVisible();

    // cancel the deletion
    await dialog.getByRole("button", { name: /Cancel/ }).click();

    // should remain on the editor page after cancelling
    await expect.poll(() => page.url()).toMatch(/\/themes\/\d+/);

    // confirm deletion
    await page.getByRole("button", { name: /Delete theme/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Delete/ })
      .click();

    await expect(
      undoToast(page)
        .filter({ hasText: "Theme deleted successfully" })
        .first(),
    ).toBeVisible();

    // should navigate back to the themes listing
    await expect.poll(() => page.url()).toContain("/admin/embedding/themes");
    await expect.poll(() => page.url()).not.toMatch(/\/themes\/\d+/);

    await expect(
      main(page).getByText("Theme to delete", { exact: true }),
    ).toHaveCount(0);
  });

  test("can delete a theme that has unsaved changes without getting stuck on a 404", async ({
    page,
    mb,
  }) => {
    // Repro of a bug where deleting a dirty theme would trigger the
    // unsaved-changes guard. The redirect to the theme list got blocked,
    // leaving the user on the now-deleted theme's URL — which 404s once the GET
    // cache is invalidated.
    const theme = await createThemeViaApi(mb.api, "Dirty delete");
    await visitThemeEditor(page, theme.id);

    // dirty the editor by renaming the theme
    await page.getByLabel("Theme name").fill("Renamed but unsaved");

    await expect(page.getByRole("button", { name: /Save theme/ })).toBeEnabled();

    // delete the theme
    await page.getByRole("button", { name: /Delete theme/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Delete/ })
      .click();

    await expect(
      undoToast(page)
        .filter({ hasText: "Theme deleted successfully" })
        .first(),
    ).toBeVisible();

    // should land on the themes listing — not 404 or leave-prompt
    await expect.poll(() => page.url()).toContain("/admin/embedding/themes");
    await expect.poll(() => page.url()).not.toMatch(/\/themes\/\d+/);
    await expect(
      main(page).getByText("We're a little lost...", { exact: true }),
    ).toHaveCount(0);
  });

  test("does not show the delete button when creating a new theme", async ({
    page,
  }) => {
    await page.goto("/admin/embedding/themes/new");

    await expect(page.getByLabel("Theme name")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Delete theme/ }),
    ).toHaveCount(0);
  });

  test.describe("font settings", () => {
    test("can edit font settings and save them", async ({ page, mb }) => {
      const theme = await createThemeViaApi(mb.api, "Font test");
      await visitThemeEditor(page, theme.id);

      // font fields should be visible
      await expect(main(page).getByLabel("Font", { exact: true })).toBeVisible();
      await expect(main(page).getByLabel("Base font size")).toBeVisible();

      // select a font family
      await main(page).getByLabel("Font", { exact: true }).click();
      await page.getByRole("option", { name: "Lato", exact: true }).click();

      // set base font size
      await main(page).getByLabel("Base font size").fill("16");

      // save the theme
      const updateTheme = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/embed-theme\/\d+$/.test(new URL(response.url()).pathname),
      );
      await main(page).getByRole("button", { name: /Save theme/ }).click();

      const settings = (await updateTheme).request().postDataJSON()
        .settings as { fontFamily: string; fontSize: string };
      expect(settings.fontFamily).toBe("Lato");
      expect(settings.fontSize).toBe("16px");

      await expect(
        undoToastList(page).filter({ hasText: "Theme saved" }).first(),
      ).toBeVisible();
    });
  });

  test.describe("main colors", () => {
    test("shows, edits, saves, and reverts main colors", async ({
      page,
      mb,
    }) => {
      const theme = await createThemeViaApi(mb.api, "Main colors");
      await visitThemeEditor(page, theme.id);

      // main color swatches should be visible
      await expect(
        main(page).getByText("Main colors", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Brand", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Background", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Primary text", { exact: true }),
      ).toBeVisible();

      // change the brand color
      await changeColor(page, "Brand", "FF0000");

      // revert button should appear after changing a main color
      await expect(
        main(page).getByLabel("Reset main colors to defaults"),
      ).toBeVisible();

      // click revert to reset main colors back to defaults
      await main(page).getByLabel("Reset main colors to defaults").click();

      // revert button should disappear after resetting
      await expect(
        main(page).getByLabel("Reset main colors to defaults"),
      ).toHaveCount(0);

      // change the brand color again
      await changeColor(page, "Brand", "FF0000");

      // save the theme with the changed brand color
      const updateTheme = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/embed-theme\/\d+$/.test(new URL(response.url()).pathname),
      );
      await page.getByRole("button", { name: /Save theme/ }).click();

      const settings = (await updateTheme).request().postDataJSON()
        .settings as { colors?: { brand?: string } };
      expect(settings.colors?.brand).toBe("#ff0000ff");

      await expect(
        undoToastList(page).filter({ hasText: "Theme saved" }).first(),
      ).toBeVisible();
    });
  });

  test.describe("additional colors", () => {
    test("shows additional colors section when expanded", async ({
      page,
      mb,
    }) => {
      const theme = await createThemeViaApi(mb.api, "Colors test");
      await visitThemeEditor(page, theme.id);

      // additional colors should be hidden by default
      await expect(
        main(page).getByText("Secondary text", { exact: true }),
      ).not.toBeVisible();

      // expand additional colors
      await main(page).getByText("Show more colors", { exact: true }).click();

      // additional color rows should be visible
      await expect(
        main(page).getByText("Secondary text", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Border", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Filter", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Chart colors", { exact: true }),
      ).toBeAttached();

      // collapse additional colors
      await main(page).getByText("Show fewer colors", { exact: true }).click();
      await expect(
        main(page).getByText("Secondary text", { exact: true }),
      ).not.toBeVisible();
    });

    test("can revert additional colors back to defaults", async ({
      page,
      mb,
    }) => {
      const theme = await createThemeViaApi(mb.api, "Revert colors");
      await visitThemeEditor(page, theme.id);

      await main(page).getByText("Show more colors", { exact: true }).click();

      // revert button should be visible since the API theme has non-default
      // additional colors
      await expect(
        main(page).getByLabel("Regenerate from brand color"),
      ).toBeVisible();

      // click revert to reset additional colors to defaults
      await main(page).getByLabel("Regenerate from brand color").click();

      // revert button should disappear after resetting
      await expect(
        main(page).getByLabel("Regenerate from brand color"),
      ).toHaveCount(0);
    });

    test("can edit additional colors and save them", async ({ page, mb }) => {
      const theme = await createThemeViaApi(mb.api, "Edit colors");
      await visitThemeEditor(page, theme.id);

      await main(page).getByText("Show more colors", { exact: true }).click();

      // edit the border color via its inline input
      await changeColor(page, "Border", "FF5733");

      // edit the filter color via its inline input
      await changeColor(page, "Filter", "2D2D30");

      // save the theme
      const updateTheme = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/embed-theme\/\d+$/.test(new URL(response.url()).pathname),
      );
      await page.getByRole("button", { name: /Save theme/ }).click();

      const settings = (await updateTheme).request().postDataJSON()
        .settings as { colors?: { border?: string; filter?: string } };
      expect(settings.colors?.border).toBe("#ff5733ff");
      expect(settings.colors?.filter).toBe("#2d2d30ff");

      await expect(
        undoToastList(page).filter({ hasText: "Theme saved" }).first(),
      ).toBeVisible();
    });
  });

  test.describe("preview panel", () => {
    test("shows enable embedding prompt when embedding is not enabled", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-simple", false);

      const theme = await createThemeViaApi(mb.api, "Preview test");
      await visitThemeEditor(page, theme.id);

      // should show prompt to enable embedding
      await expect(
        main(page).getByText(
          "Enable modular embedding to see a live preview of your theme.",
          { exact: true },
        ),
      ).toBeVisible();

      await expect(
        main(page).getByRole("button", { name: /Enable modular embedding/ }),
      ).toBeVisible();
    });

    test("shows theme preview when embedding is enabled", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-simple", true);
      await mb.api.updateSetting("show-simple-embed-terms", false);

      const theme = await createThemeViaApi(mb.api, "Preview test");
      await visitThemeEditor(page, theme.id);

      // should show the theme preview heading
      await expect(
        main(page).getByText("Theme preview", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("preview picker", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.updateSetting("enable-embedding-simple", true);
      await mb.api.updateSetting("show-simple-embed-terms", false);
    });

    test("defaults to a dashboard and can switch to a question", async ({
      page,
      mb,
    }) => {
      const theme = await createThemeViaApi(mb.api, "Picker test");
      await visitThemeEditor(page, theme.id);

      // picker button shows the default dashboard name
      const pickerButton = main(page).getByLabel("Change preview resource");
      await expect(pickerButton).toBeVisible();
      await expect(pickerButton).toContainText("Orders in a dashboard");

      // preview renders the dashboard web component
      await expect(main(page).locator("metabase-dashboard")).toBeAttached();

      // opens the entity picker modal
      await pickerButton.click();

      await expect(
        entityPickerModal(page).getByText("Select data to preview", {
          exact: true,
        }),
      ).toBeVisible();
      await entityPickerModal(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText("Orders, Count", { exact: true })
        .click();

      // picker button updates to the selected question
      await expect(
        main(page).getByLabel("Change preview resource"),
      ).toContainText("Orders, Count");

      // preview switches to the question web component
      await expect(main(page).locator("metabase-question")).toBeAttached();
      await expect(main(page).locator("metabase-dashboard")).toHaveCount(0);
    });
  });
});
