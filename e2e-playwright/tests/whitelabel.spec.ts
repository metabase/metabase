/**
 * Port of e2e/test/scenarios/admin-2/whitelabel.cy.spec.js
 * (Admin > Settings > Appearance / Whitelabel — the @EE feature: app name,
 * logo, favicon, custom illustrations, loading message, Metabot welcome,
 * font, help link, and the landing-page setting).
 *
 * Port notes:
 * - Gated on the pro-self-hosted token (the whitelabel feature); the jar
 *   activates it. The describe's beforeEach re-activates it after each restore
 *   (restore resets settings).
 * - File uploads: cy.selectFile(force) → setInputFiles on the hidden
 *   input[type=file] (works regardless of visibility). Buffer-backed fake
 *   files (over-2MB / "corrupted") map to setInputFiles with a Buffer.
 * - cy.request("/api/setting/…") checks → mb.api.get (spec-local checkFavicon,
 *   checkLogo, changeLoadingMessage, setApplicationFontTo now in
 *   support/whitelabel.ts).
 * - The @prerelease tag on the login-page-illustration test has no Playwright
 *   equivalent — it runs unconditionally.
 * - PUT-setting intercepts (@putHelpLink etc.) → waitForResponse registered
 *   before the triggering action (rule 2).
 */
import { resolveToken } from "../support/api";
import { deleteToken } from "../support/admin-extras";
import { getHelpSubmenu, getProfileLink } from "../support/command-palette";
import { selectDropdown } from "../support/dashboard";
import { createDashboardWithQuestions } from "../support/factories";
import { goToMainApp } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { entityPickerModal } from "../support/notebook";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { appBar, icon, main, modal, popover } from "../support/ui";
import {
  FAVICON_BASE64,
  LOGO_DATA_URI,
  LOGO_PATH,
  MB,
  changeLoadingMessage,
  checkFavicon,
  checkLogo,
  getHelpLinkCustomDestinationInput,
  helpLink,
  setApplicationFontTo,
} from "../support/whitelabel";

// The favicon upload payload: favicon.ico bytes declared as image/jpeg, so the
// stored setting is a data:image/jpeg;base64 URI (mirrors the Cypress selectFile
// with { contents: "…/favicon.ico", mimeType: "image/jpeg" }).
const FAVICON_UPLOAD = {
  name: "favicon.ico",
  mimeType: "image/jpeg",
  buffer: Buffer.from(FAVICON_BASE64, "base64"),
};

test.describe("formatting > whitelabel", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires the pro-self-hosted token (whitelabel is an EE feature)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("smoke UI test", async ({ page, mb }) => {
    // Should show all whitelabel options with the feature enabled.
    await page.goto("/admin/settings/whitelabel");

    // Upsell icon should not be present in the sidebar link.
    const appearanceLink = page
      .getByTestId("settings-sidebar-link")
      .filter({ hasText: "Appearance" });
    await expect(appearanceLink).toHaveText("Appearance");
    await expect(appearanceLink.locator(".Icon-gem")).toHaveCount(0);

    // Should show the upsell if the feature is missing.
    await deleteToken(mb.api);
    await page.goto("/admin/settings/appearance");
    await expect(
      page.getByRole("heading", {
        name: "Make Metabase look like you",
        exact: true,
      }),
    ).toBeVisible();
    const learnMore = page.getByRole("link", { name: "Learn more", exact: true });
    const href = await learnMore.getAttribute("href");
    expect(href).toContain(
      "https://www.metabase.com/docs/latest/configuring-metabase/appearance",
    );
    expect(href).toContain("utm_");
    await expect(
      page.getByRole("button", { name: "Try for free", exact: true }),
    ).toBeVisible();

    // Upsell icon should now be visible in the sidebar link.
    await expect(appearanceLink).toHaveText("Appearance");
    await expect(appearanceLink.locator(".Icon-gem")).toBeVisible();
  });

  test.describe("company name", () => {
    const NEW_COMPANY_NAME = "New Test Co";

    test.beforeEach(async ({ page }) => {
      await page.goto("/admin/settings/whitelabel/conceal-metabase");
      const appName = page.getByLabel("Application name", { exact: true });
      await appName.click();
      await appName.fill(NEW_COMPANY_NAME);
      await appName.blur();
      await expect(
        undoToast(page).getByText("Changes saved", { exact: true }).first(),
      ).toBeVisible();
      await expect(appName).toHaveValue(NEW_COMPANY_NAME);
    });

    test("should not show the old name in the admin panel (metabase#17043)", async ({
      page,
    }) => {
      await page.goto("/admin/settings/general");
      await expect(
        page
          .getByTestId("site-name-setting")
          .getByText(`The name used for this instance of ${NEW_COMPANY_NAME}.`, {
            exact: true,
          }),
      ).toBeVisible();
    });

    test("should show the new name in the main app", async ({ page }) => {
      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      await getHelpSubmenu(page)
        .getByText(`About ${NEW_COMPANY_NAME}`, { exact: true })
        .click();
      await expect(
        modal(page).getByText(`Thanks for using ${NEW_COMPANY_NAME}!`, {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("image uploads", () => {
    test.describe("company logo", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.api.updateSetting("application-logo-url", LOGO_DATA_URI);
      });

      test("changes should reflect on admin's dashboard", async ({ page }) => {
        await page.goto("/");
        await checkLogo(page);
      });

      test("changes should reflect while signed out", async ({ page, mb }) => {
        await mb.signOut();
        await page.goto("/");
        await checkLogo(page);
      });

      test("changes should reflect on user's dashboard", async ({
        page,
        mb,
      }) => {
        await mb.signInAsNormalUser();
        await page.goto("/");
        await checkLogo(page);
      });
    });

    test.describe("favicon", () => {
      test("should work for people that set favicon URL before we change the input to file input", async ({
        page,
        mb,
      }) => {
        const faviconUrl = "https://cdn.ecosia.org/assets/images/ico/favicon.ico";
        await mb.api.updateSetting("application-favicon-url", faviconUrl);
        await checkFavicon(mb.api, faviconUrl);
        await mb.signInAsNormalUser();
        await page.goto("/");
        await expect(
          page.locator(`head link[rel="icon"][href="${faviconUrl}"]`),
        ).toHaveCount(1);
      });

      test("should show up in user's HTML", async ({ page, mb }) => {
        await page.goto("/admin/settings/whitelabel");

        // Add favicon.
        const putFavicon = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname ===
              "/api/setting/application-favicon-url",
        );
        await page
          .getByLabel("Favicon", { exact: true })
          .setInputFiles(FAVICON_UPLOAD);
        await putFavicon;
        await expect(
          undoToast(page).getByText("Changes saved", { exact: true }).first(),
        ).toBeVisible();

        // The stored favicon is the base64 data URI of the uploaded file
        // (the setting GET returns raw text/plain, not JSON).
        const stored = await mb.api.get("/api/setting/application-favicon-url");
        const faviconUrl = await stored.text();
        expect(faviconUrl).toContain("data:image/jpeg;base64,");

        await mb.signInAsNormalUser();
        await page.goto("/");
        await expect(
          page.locator(`head link[rel="icon"][href="${faviconUrl}"]`),
        ).toHaveCount(1);
      });
    });

    test.describe("custom illustrations", () => {
      test.describe("login page illustration", () => {
        // Cypress tag: @prerelease — no Playwright equivalent, runs unconditionally.
        test("should only allow uploading a valid image files (PNG, JPG, SVG) and display on login page", async ({
          page,
          mb,
        }) => {
          await page.goto("/admin/settings/whitelabel/conceal-metabase");

          // test error message for file size > 2MB
          await page
            .getByRole("textbox", { name: "Login and unsubscribe pages" })
            .click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();
          const loginSetting = page.getByTestId(
            "login-page-illustration-setting",
          );
          await loginSetting.getByTestId("file-input").setInputFiles({
            name: "big-file.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("a".repeat(2 * MB + 1)),
          });
          await expect(
            loginSetting.getByText(
              "The image you chose is larger than 2MB. Please choose another one.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            loginSetting.getByText("big-file.jpg", { exact: true }),
          ).toHaveCount(0);

          // test uploading a corrupted file
          await page
            .getByRole("textbox", { name: "Login and unsubscribe pages" })
            .click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();
          await loginSetting.getByTestId("file-input").setInputFiles({
            name: "corrupted-file.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("a".repeat(2 * MB)),
          });
          const corruptedError = loginSetting.getByText(
            "The image you chose is corrupted. Please choose another one.",
            { exact: true },
          );
          await corruptedError.scrollIntoViewIfNeeded();
          await expect(corruptedError).toBeVisible();
          await expect(
            loginSetting.getByText("corrupted-file.jpg", { exact: true }),
          ).toHaveCount(0);

          // test replacing the "corrupted" file with a valid one
          await loginSetting
            .getByTestId("file-input")
            .setInputFiles(LOGO_PATH);
          await expect(
            loginSetting.getByText("logo.jpeg", { exact: true }),
          ).toBeVisible();
          await expect(corruptedError).toHaveCount(0);
          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();
          // The illustration setting fires two PUTs → two stacked toasts.
          // Dismiss them best-effort so the next "Changes saved" assertion reads
          // a fresh toast; they also auto-dismiss (animating out), so a click
          // can race their removal — tolerate that.
          for (let i = 0; i < 5; i++) {
            const close = icon(undoToast(page), "close").first();
            if ((await close.count()) === 0) {
              break;
            }
            try {
              await close.click({ timeout: 2000 });
            } catch {
              break;
            }
          }

          // test removing the custom illustration
          await loginSetting
            .getByRole("button", { name: "Remove custom illustration" })
            .click();
          // the default option should be selected once removing the custom illustration
          await expect(
            loginSetting.getByRole("textbox", {
              name: "Login and unsubscribe pages",
            }),
          ).toHaveValue("Lighthouse");
          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();
          // The illustration setting fires two PUTs → two stacked toasts.
          // Dismiss them best-effort so the next "Changes saved" assertion reads
          // a fresh toast; they also auto-dismiss (animating out), so a click
          // can race their removal — tolerate that.
          for (let i = 0; i < 5; i++) {
            const close = icon(undoToast(page), "close").first();
            if ((await close.count()) === 0) {
              break;
            }
            try {
              await close.click({ timeout: 2000 });
            } catch {
              break;
            }
          }

          // test uploading a valid image file
          await loginSetting
            .getByRole("textbox", { name: "Login and unsubscribe pages" })
            .click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();
          await loginSetting
            .getByTestId("file-input")
            .setInputFiles(LOGO_PATH);
          await expect(
            loginSetting.getByText("logo.jpeg", { exact: true }),
          ).toBeVisible();
          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();

          const backgroundImage = `url("${LOGO_DATA_URI}")`;
          await mb.signOut();
          await page.goto("/");
          await expect(
            page.getByTestId("login-page-illustration"),
          ).toHaveCSS("background-image", backgroundImage);

          await page.goto("/unsubscribe?hash=hash&email=email&pulse-id=pulse-id");
          await expect(
            page.getByTestId("unsubscribe-page-illustration"),
          ).toHaveCSS("background-image", backgroundImage);

          // test no illustration
          await mb.signInAsAdmin();
          await page.goto("/admin/settings/whitelabel/conceal-metabase");
          await page
            .getByRole("textbox", { name: "Login and unsubscribe pages" })
            .click();
          await selectDropdown(page)
            .getByText("No illustration", { exact: true })
            .click();

          await mb.signOut();
          await page.goto("/");
          await expect(
            page.getByTestId("login-page-illustration"),
          ).toHaveCount(0);

          await page.goto("/unsubscribe?hash=hash&email=email&pulse-id=pulse-id");
          await expect(
            page.getByTestId("unsubscribe-page-illustration"),
          ).toHaveCount(0);
        });
      });

      test.describe("landing page illustration", () => {
        test("should allow display the selected illustration on the landing page", async ({
          page,
        }) => {
          await page.goto("/admin/settings/whitelabel/conceal-metabase");

          const landingSetting = page.getByTestId(
            "landing-page-illustration-setting",
          );
          await expect(landingSetting.getByRole("textbox")).toHaveValue(
            "Lighthouse",
          );
          await landingSetting.getByRole("textbox").click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();

          await landingSetting.getByTestId("file-input").setInputFiles(LOGO_PATH);
          await expect(
            landingSetting.getByText("logo.jpeg", { exact: true }),
          ).toBeVisible();

          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();

          const backgroundImage = `url("${LOGO_DATA_URI}")`;
          await page.goto("/");
          await expect(
            page.getByTestId("landing-page-illustration"),
          ).toHaveCSS("background-image", backgroundImage);

          // test no illustration
          await page.goto("/admin/settings/whitelabel/conceal-metabase");
          await expect(landingSetting.getByRole("textbox")).toHaveValue("Custom");
          await landingSetting.getByRole("textbox").click();
          await selectDropdown(page)
            .getByText("No illustration", { exact: true })
            .click();

          await page.goto("/");
          await expect(
            page.getByTestId("landing-page-illustration"),
          ).toHaveCount(0);
        });
      });

      test.describe("no data illustration", () => {
        test("should allow display the selected illustration at relevant places", async ({
          page,
          mb,
        }) => {
          await page.goto("/admin/settings/whitelabel/conceal-metabase");

          const noDataSelect = page.getByRole("textbox", {
            name: "When calculations return no results",
          });
          await expect(noDataSelect).toHaveValue("Sailboat");
          await noDataSelect.click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();

          const noDataSetting = page.getByTestId("no-data-illustration-setting");
          await noDataSetting.getByTestId("file-input").setInputFiles(LOGO_PATH);
          await expect(
            noDataSetting.getByText("logo.jpeg", { exact: true }),
          ).toBeVisible();
          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();

          const { dashboard, questions } = await createDashboardWithQuestions(
            mb.api,
            {
              dashboardName: "No results dashboard",
              questions: [
                {
                  name: "No results question",
                  native: {
                    query: "select * from products where id = 999999999",
                  },
                },
              ],
            },
          );
          const dashboardId = dashboard.id;
          const questionId = questions[0].id;

          // test custom illustration
          await visitDashboardWaitForNoResults(page, dashboardId);
          await expect(page.getByAltText("No results", { exact: true })).toHaveAttribute(
            "src",
            LOGO_DATA_URI,
          );

          await visitQuestionWaitForNoResults(page, questionId);
          await expect(page.getByAltText("No results", { exact: true })).toHaveAttribute(
            "src",
            LOGO_DATA_URI,
          );

          // test no illustration
          await page.goto("/admin/settings/whitelabel/conceal-metabase");
          await page
            .getByRole("textbox", { name: "When calculations return no results" })
            .click();
          await selectDropdown(page)
            .getByText("No illustration", { exact: true })
            .click();

          await visitDashboardWaitForNoResults(page, dashboardId);
          await expect(
            page.getByAltText("No results", { exact: true }),
          ).toHaveCount(0);

          await visitQuestionWaitForNoResults(page, questionId);
          await expect(
            page.getByAltText("No results", { exact: true }),
          ).toHaveCount(0);
        });
      });

      test.describe("no object illustration", () => {
        test("should allow display the selected illustration at relevant places", async ({
          page,
          mb,
        }) => {
          const emptyCollectionName = "Empty Collection";
          await mb.api.post("/api/collection", { name: emptyCollectionName });
          await page.goto("/admin/settings/whitelabel/conceal-metabase");

          const noObjectSelect = page.getByRole("textbox", {
            name: "When no objects can be found",
          });
          await expect(noObjectSelect).toHaveValue("Sailboat");
          await noObjectSelect.click();
          await selectDropdown(page).getByText("Custom", { exact: true }).click();

          const noObjectSetting = page.getByTestId(
            "no-object-illustration-setting",
          );
          await noObjectSetting
            .getByTestId("file-input")
            .setInputFiles(LOGO_PATH);
          await expect(
            noObjectSetting.getByText("logo.jpeg", { exact: true }),
          ).toBeVisible();
          await expect(
            undoToast(page).getByText("Changes saved", { exact: true }).first(),
          ).toBeVisible();

          // test custom illustration
          await goToMainApp(page);
          await appBar(page).getByText("New", { exact: true }).click();
          await popover(page).getByText("Dashboard", { exact: true }).click();
          await modal(page).getByTestId("collection-picker-button").click();
          {
            const picker = entityPickerModal(page);
            // test search not found illustration
            const searchInput = picker.getByPlaceholder("Search…", {
              exact: true,
            });
            const query = "This aren't the objects you're looking for";
            await searchInput.click();
            await searchInput.pressSequentially(query);
            // Gate on the typed value landing — pressSequentially can race the
            // freshly-mounted modal and drop keystrokes, leaving an empty search
            // (no "No results" state ever renders).
            await expect(searchInput).toHaveValue(query);
            await expect(
              picker.getByAltText("No results", { exact: true }),
            ).toHaveAttribute("src", LOGO_DATA_URI);
          }

          // test no illustration
          await page.goto("/admin/settings/whitelabel/conceal-metabase");
          await page
            .getByRole("textbox", { name: "When no objects can be found" })
            .click();
          await selectDropdown(page)
            .getByText("No illustration", { exact: true })
            .click();

          await goToMainApp(page);
          await appBar(page).getByText("New", { exact: true }).click();
          await popover(page).getByText("Dashboard", { exact: true }).click();
          await modal(page).getByTestId("collection-picker-button").click();
          {
            const picker = entityPickerModal(page);
            await picker.getByText(emptyCollectionName, { exact: true }).click();
            await expect(
              picker.getByAltText("No results", { exact: true }),
            ).toHaveCount(0);

            // test search not found illustration
            const searchInput = picker.getByPlaceholder("Search…", {
              exact: true,
            });
            const query = "This aren't the objects you're looking for";
            await searchInput.click();
            await searchInput.pressSequentially(query);
            await expect(searchInput).toHaveValue(query);
            await expect(
              picker.getByAltText("No results", { exact: true }),
            ).toHaveCount(0);
          }
        });
      });
    });
  });

  test.describe("loading message", () => {
    test("should update loading message", async ({ page }) => {
      const messages = [
        "Loading results...",
        "Doing science...",
        "Running query...",
      ];

      // The loading message only renders while the query is running (in the QB
      // overlay). Against the jar that window is sub-100ms, so hold the query
      // response back long enough for the message to be observable — the state
      // the test targets. (Cypress's retry-until-timeout caught the brief
      // window; Playwright's poll can miss it.)
      await page.route(
        (url) => /\/api\/card\/\d+\/query$/.test(new URL(url).pathname),
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await route.continue();
        },
      );

      for (const message of messages) {
        await changeLoadingMessage(page, message);
        // can't use the visitQuestion helper because it waits for loading to be
        // finished — the loading message is only visible during the query run.
        await page.goto(`/question/${ORDERS_QUESTION_ID}`);
        await expect(
          page
            .getByTestId("query-builder-main")
            .getByText(message, { exact: true }),
        ).toBeVisible();
      }
    });
  });

  test.describe("metabot", () => {
    test("should toggle metabot visibility", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("img", { name: "Metabot", exact: true }),
      ).toHaveCount(2);

      await page.goto("/admin/settings/whitelabel/conceal-metabase");
      await page
        .getByRole("main")
        .getByText("Display welcome message on the homepage", { exact: true })
        .click();

      await expect(
        undoToast(page).getByText("Changes saved", { exact: true }).first(),
      ).toBeVisible();

      await page.goto("/");
      await expect(page.getByRole("link", { name: /home/ })).toHaveCount(1);
      await expect(
        page.getByRole("img", { name: "Metabot", exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("font", () => {
    test.beforeEach(async ({ mb }) => {
      // Change Application Font.
      await mb.signInAsAdmin();
    });

    test("should apply correct font", async ({ page, mb }) => {
      await setApplicationFontTo(mb.api, "Open Sans");
      await mb.signInAsNormalUser();
      await page.goto("/");
      await expect(page.locator("body")).toHaveCSS(
        "font-family",
        '"Open Sans", Lato, sans-serif',
      );
    });

    test("should be able to make multiple font changes (metabase#45486)", async ({
      page,
    }) => {
      const fontsWithExpectedFallback: [string, string][] = [
        ["Lora", "serif"],
        ["Merriweather", "Lora, serif"],
        ["Montserrat", "sans-serif"],
        ["Lato", "Arial, sans-serif"],
      ];
      await page.goto("/admin/settings/whitelabel/branding");

      for (const [newFont, fallback] of fontsWithExpectedFallback) {
        await page.getByLabel("Font", { exact: true }).click();
        const saveFont = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname ===
              "/api/setting/application-font",
        );
        await selectDropdown(page).getByText(newFont, { exact: true }).click();
        await saveFont;
        await expect(page.locator("body")).toHaveCSS(
          "font-family",
          `${newFont}, ${fallback}`,
        );
      }
    });
  });

  test.describe("Help link", () => {
    const CONCEAL = "/admin/settings/whitelabel/conceal-metabase";

    function waitForHelpLinkPut(page: import("@playwright/test").Page) {
      return page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/setting/help-link",
      );
    }

    function waitForHelpLinkUrlPut(page: import("@playwright/test").Page) {
      return page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname ===
            "/api/setting/help-link-custom-destination",
      );
    }

    test("should allow customising the help link", async ({ page, mb }) => {
      // Hide Help link.
      await mb.signInAsAdmin();
      await page.goto(CONCEAL);

      await expect(
        page.getByLabel("Link to Metabase help", { exact: true }),
      ).toBeChecked();

      const putHide = waitForHelpLinkPut(page);
      await page
        .getByTestId("help-link-setting")
        .getByText("Hide it", { exact: true })
        .click();
      await putHide;

      await mb.signInAsNormalUser();
      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      await expect(helpLink(page)).toHaveCount(0);

      // Set custom Help link.
      await mb.signInAsAdmin();
      await page.goto(CONCEAL);

      const putCustomMode = waitForHelpLinkPut(page);
      await page
        .getByTestId("help-link-setting")
        .getByText("Go to a custom destination...", { exact: true })
        .click();

      const customInput = getHelpLinkCustomDestinationInput(page);
      await expect(customInput).toBeFocused();
      const putCustomUrl = waitForHelpLinkUrlPut(page);
      await customInput.fill("https://example.org/custom-destination");
      await customInput.blur();
      await putCustomUrl;
      await putCustomMode;

      // Check that on page load the text field is not focused.
      await page.reload();
      await expect(getHelpLinkCustomDestinationInput(page)).not.toBeFocused();

      await mb.signInAsNormalUser();
      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      await expect(helpLink(page)).toHaveAttribute(
        "href",
        "https://example.org/custom-destination",
      );

      // Set default Help link.
      await mb.signInAsAdmin();
      await page.goto(CONCEAL);

      const putDefault = waitForHelpLinkPut(page);
      await page
        .getByTestId("help-link-setting")
        .getByText("Link to Metabase help", { exact: true })
        .click();
      await putDefault;

      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      expect(await helpLink(page).getAttribute("href")).toContain(
        "https://www.metabase.com/help-premium?",
      );

      await mb.signInAsNormalUser();
      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      expect(await helpLink(page).getAttribute("href")).toContain(
        "https://www.metabase.com/help?",
      );
    });

    test("should link to metabase help when the whitelabel feature is disabled (eg OSS)", async ({
      page,
      mb,
    }) => {
      await deleteToken(mb.api);

      await mb.signInAsNormalUser();
      await page.goto("/");
      await getProfileLink(page).click();
      await popover(page).getByText("Help", { exact: true }).click();
      expect(await helpLink(page).getAttribute("href")).toContain(
        "https://www.metabase.com/help?",
      );
    });

    test("it should validate the url", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await page.goto(CONCEAL);

      await page
        .getByTestId("help-link-setting")
        .getByText("Go to a custom destination...", { exact: true })
        .click();

      const customInput = getHelpLinkCustomDestinationInput(page);
      await customInput.fill("ftp://something");
      await customInput.blur();
      await expect(main(page).getByText(/This needs to be/i)).toBeVisible();

      await customInput.fill("https://");
      await customInput.blur();
      await expect(
        main(page).getByText("Please make sure this is a valid URL", {
          exact: true,
        }),
      ).toBeVisible();

      // Append to the "https://" left in the field (Cypress .type without clear).
      await customInput.fill("https://example");
      await customInput.blur();
      await expect(
        main(page).getByText("Please make sure this is a valid URL", {
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });

  test.describe("Landing Page (now moved to general tab metabase#38699)", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.signInAsAdmin();
      const getSettings = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/setting",
      );
      await page.goto("/admin/settings/general");
      await getSettings;
    });

    const urlInput = (page: import("@playwright/test").Page) =>
      page
        .getByTestId("homepage-setting")
        .getByLabel("Landing page custom destination", { exact: true });

    test("should not offer the Custom URL option when the user does not have a valid license", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("starter");
      const getSettings = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/setting",
      );
      await page.reload();
      await getSettings;
      // Anchor on a positive signal so the negative assertion can't pass while
      // the page is still loading.
      await expect(
        page
          .getByTestId("homepage-setting")
          .getByRole("radio", { name: "Default Metabase home" }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("homepage-setting")
          .getByRole("radio", { name: "Custom URL" }),
      ).toHaveCount(0);
    });

    test("should validate the URL and persist only same-origin relative paths", async ({
      page,
    }) => {
      // Clicking "Custom URL" fires a PUT to /api/setting (custom-homepage =
      // false) AND mounts the URL field. Wait for that PUT to land before typing
      // so LandingPageUrlField's useEffect can't overwrite the typed value.
      const modeChangePut = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/setting",
      );
      await page
        .getByTestId("homepage-setting")
        .getByRole("radio", { name: "Custom URL" })
        .click();
      await modeChangePut;

      const putLandingPage = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/setting/landing-page",
      );
      const input = urlInput(page);
      await input.click();
      await input.fill("/test-1");
      await expect(input).toHaveValue("/test-1");
      await input.blur();
      await putLandingPage;
      await expect(
        undoToast(page).getByText("Changes saved", { exact: true }).first(),
      ).toBeVisible();

      // External URLs are rejected and the previous value is preserved.
      await input.click();
      await input.fill("");
      await expect(input).toHaveValue("");
      await input.fill("https://google.com");
      await expect(input).toHaveValue("https://google.com");
      await input.blur();
      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("This field must be a relative URL.", { exact: true }),
      ).toBeVisible();

      await goToMainApp(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/test-1");
    });
  });
});

/**
 * The no-data question returns zero rows, so H.visitDashboard/visitQuestion's
 * query waits still resolve — but we only need to reach the rendered empty
 * state. Navigate and wait for the dashcard/card query to complete.
 */
async function visitDashboardWaitForNoResults(
  page: import("@playwright/test").Page,
  dashboardId: number,
) {
  const query = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await page.goto(`/dashboard/${dashboardId}`);
  await query;
}

async function visitQuestionWaitForNoResults(
  page: import("@playwright/test").Page,
  questionId: number,
) {
  const query = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/card/${questionId}/query`,
  );
  await page.goto(`/question/${questionId}`);
  await query;
}
