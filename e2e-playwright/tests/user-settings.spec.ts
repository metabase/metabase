/**
 * Port of e2e/test/scenarios/onboarding/setup/user_settings.cy.spec.js.
 *
 * Notes on the port:
 * - stubCurrentUser (SSO describes) → page.route on GET /api/user/current,
 *   fetching the real user and merging the sso_source (support/user-settings.ts).
 * - stubSystemColorScheme (onBeforeLoad matchMedia stub) → page.emulateMedia
 *   ({ colorScheme }), which drives the real prefers-color-scheme media query
 *   the app reads — cleaner than stubbing matchMedia and equivalent.
 * - Dark-mode keyboard shortcut ($mod+Shift+KeyL, a kbar/tinykeys binding):
 *   Cypress could not deliver this via realPress in headless Chrome and fell
 *   back to a synthetic KeyboardEvent dispatch. Playwright drives it with a
 *   real key press (page.keyboard.press("ControlOrMeta+Shift+KeyL")). See
 *   findings-inbox/user-settings.md — this is a capability dividend.
 */
import { expect, test } from "../support/fixtures";
import { getProfileLink } from "../support/command-palette";
import {
  findByDisplayValue,
  trackResponses,
  waitForResponseMatching,
} from "../support/filters-repros";
import {
  emailInput,
  passwordInput,
  signInButton,
  submitLoginForm,
} from "../support/signin";
import {
  collectionTable,
  navigationSidebar,
  openNavigationSidebar,
  popover,
} from "../support/ui";
import { pickEntity } from "../support/dashboard";
import { miniPicker } from "../support/notebook";
import {
  NORMAL_USER,
  NORMAL_USER_ID,
  assertDarkMode,
  assertLightMode,
  colorSchemeInput,
  getFullName,
  goToProfile,
  stubCurrentUser,
  waitForGetUser,
} from "../support/user-settings";

const { first_name, last_name, email, password } = NORMAL_USER;

test.describe("user > settings", () => {
  const fullName = getFullName();

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to remove first name and last name (metabase#22754)", async ({
    page,
  }) => {
    await page.goto("/account/profile");
    await expect(
      page.getByText(fullName, { exact: true }).first(),
    ).toBeVisible();
    await page.getByLabel("First name", { exact: true }).fill("");
    await page.getByLabel("Last name", { exact: true }).fill("");
    await page.getByRole("button", { name: "Update", exact: true }).click();

    await page.reload();

    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Last name", { exact: true })).toHaveValue("");
  });

  test("should show user details with disabled submit button", async ({
    page,
  }) => {
    await page.goto("/account/profile");
    const header = page.getByTestId("account-header");
    await expect(header.getByText(fullName, { exact: true })).toBeVisible();
    await expect(header.getByText(email, { exact: true })).toBeVisible();
    await findByDisplayValue(page.getByRole("main"), first_name);
    await findByDisplayValue(page.getByRole("main"), last_name);
    await findByDisplayValue(page.getByRole("main"), email);
    await expect(
      page.getByRole("button", { name: "Update", exact: true }),
    ).toBeDisabled();
  });

  test("should update the user without fetching memberships", async ({
    page,
  }) => {
    const membershipCount = trackResponses(
      page,
      "GET",
      /^\/api\/permissions\/membership$/,
    );
    await page.goto("/account/profile");
    const firstNameInput = await findByDisplayValue(
      page.getByRole("main"),
      first_name,
    );
    await firstNameInput.click();
    await firstNameInput.fill("");
    await firstNameInput.fill("John");
    await page.getByText("Update", { exact: true }).click();
    await findByDisplayValue(page.getByRole("main"), "John");

    // It is hard and unreliable to assert that something didn't happen; the
    // Cypress original leant on "@membership.all" having length 0.
    expect(membershipCount()).toBe(0);
  });

  test("should have a change password tab", async ({ page }) => {
    const getUser = waitForGetUser(page);
    await page.goto("/account/profile");
    await getUser;
    await expect(page.getByText("Password", { exact: true })).toBeVisible();
  });

  test("should redirect to the login page when the user has signed out but tries to visit `/account/profile` (metabase#15471)", async ({
    page,
    mb,
  }) => {
    await mb.signOut();
    await page.goto("/account/profile");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(
      page.getByText("Sign in to Metabase", { exact: true }),
    ).toBeVisible();
  });

  test("should redirect to the login page when the user has changed the password and logged out (metabase#18151)", async ({
    page,
  }) => {
    await page.goto("/account/password");

    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page.getByLabel("Create a password", { exact: true }).fill(password);
    await page
      .getByLabel("Confirm your password", { exact: true })
      .fill(password);
    await page.getByText("Save", { exact: true }).click();
    await expect(page.getByText("Success", { exact: true })).toBeVisible();

    await getProfileLink(page).click();
    await popover(page).getByText("Sign out", { exact: true }).click();
    await expect(
      page.getByText("Sign in to Metabase", { exact: true }),
    ).toBeVisible();
  });

  test("should validate form values (metabase#23259)", async ({ page }) => {
    await page.goto("/account/password");

    // Validate common passwords
    const passwordField = page.getByLabel(/Create a password/i);
    await passwordField.fill("qwerty123");
    await passwordField.blur();

    // cy.contains → case-sensitive substring
    await expect(page.getByText(/password is too common/).first()).toBeVisible();
    await passwordField.fill("");

    // Validate invalid current password
    await page.getByLabel("Current password", { exact: true }).fill("invalid");

    await passwordField.fill("new_password1");
    await page
      .getByLabel("Confirm your password", { exact: true })
      .fill("new_password1");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Invalid password/).first()).toBeVisible();
  });

  test("should be able to change a language (metabase#22192)", async ({
    page,
  }) => {
    await page.goto("/account/profile");

    await page
      .getByTestId("user-locale-select")
      .getByRole("textbox")
      .click();

    await popover(page).getByText("Indonesian", { exact: true }).click();

    const updateUserSettings = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/user\/.*$/,
    );
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await updateUserSettings;

    // Assert that the page reloaded with the new language
    await expect(page.getByLabel("Nama depan", { exact: true })).toBeVisible();

    // We need some UI element other than a string, and cannot get by labels as
    // they could be translated
    await expect(getProfileLink(page)).toBeVisible();
  });

  test("should be able to open the app with every locale from the available locales (metabase#22192)", async ({
    page,
    mb,
  }) => {
    test.slow();
    const user = (await (await mb.api.get("/api/user/current")).json()) as {
      id: number;
    };
    const settings = (await (
      await mb.api.get("/api/session/properties")
    ).json()) as { "available-locales": [string, string][] };

    for (const [locale] of settings["available-locales"]) {
      await mb.api.put(`/api/user/${user.id}`, { locale });
      const getUser = waitForGetUser(page);
      await page.goto("/");
      await getUser;
      await expect(getProfileLink(page)).toBeVisible();
    }
  });

  test("should show correct translations when a user logs in with a locale that is different from the site locale", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/user/${NORMAL_USER_ID}`, { locale: "fr" });
    await mb.signOut();

    const firstGetUser = waitForGetUser(page);
    await page.goto("/question/notebook");
    await firstGetUser;

    const secondGetUser = waitForGetUser(page);
    await submitLoginForm(page, email, password);

    // should be redirected to new question page
    await secondGetUser;
    await miniPicker(page).getByText("Parcourir tout", { exact: true }).click();
    await pickEntity(page, { path: ["Nos analyses", "Orders Model"] });
    await expect(
      page.getByTestId("step-summarize-0-0").getByText("Summarize", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("step-summarize-0-0").getByText("Résumer", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test.describe("when user is authenticated via ldap", () => {
    test.beforeEach(async ({ page }) => {
      await stubCurrentUser(page, { sso_source: "ldap" });
      const getUser = waitForGetUser(page);
      await page.goto("/account/profile");
      await getUser;
    });

    test("should hide change password tab", async ({ page }) => {
      await expect(page.getByText("Password", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("when user is authenticated via google", () => {
    test.beforeEach(async ({ page }) => {
      await stubCurrentUser(page, { sso_source: "google" });
      const getUser = waitForGetUser(page);
      await page.goto("/account/profile");
      await getUser;
    });

    test("should hide change password tab", async ({ page }) => {
      await expect(page.getByText("Password", { exact: true })).toHaveCount(0);
    });

    test("should hide first name, last name, and email input (metabase#23298)", async ({
      page,
    }) => {
      await expect(
        page.getByLabel("First name", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Last name", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("when user is authenticated via JWT", () => {
    test.beforeEach(async ({ page }) => {
      await stubCurrentUser(page, { sso_source: "jwt" });
      const getUser = waitForGetUser(page);
      await page.goto("/account/profile");
      await getUser;
    });

    test("should hide change password tab", async ({ page }) => {
      await expect(page.getByText("Password", { exact: true })).toHaveCount(0);
    });

    test("should hide first name, last name, and email input (metabase#23298)", async ({
      page,
    }) => {
      await expect(
        page.getByLabel("First name", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Last name", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("when user is authenticated via SAML", () => {
    test.beforeEach(async ({ page }) => {
      await stubCurrentUser(page, { sso_source: "saml" });
      const getUser = waitForGetUser(page);
      await page.goto("/account/profile");
      await getUser;
    });

    test("should hide change password tab", async ({ page }) => {
      await expect(page.getByText("Password", { exact: true })).toHaveCount(0);
    });

    test("should hide first name, last name, and email input (metabase#23298)", async ({
      page,
    }) => {
      await expect(
        page.getByLabel("First name", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Last name", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("dark mode", () => {
    test("should toggle through light and dark mode when clicking on the label or icon", async ({
      page,
    }) => {
      await page.goto("/account/profile");

      await (await colorSchemeInput(page, "Use system default")).click();
      await popover(page).getByText("Dark", { exact: true }).click();
      await assertDarkMode(page);

      await (await colorSchemeInput(page, "Dark")).click();
      await popover(page).getByText("Light", { exact: true }).click();
      await assertLightMode(page);

      // Need to take focus off the input
      await navigationSidebar(page)
        .getByRole("link", { name: /Home/ })
        .click();
      // Wait for navigation to complete so kbar shortcut handlers are
      // re-registered.
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/");
      // The dark-mode kbar shortcut is $mod+Shift+KeyL. Cypress could not
      // deliver this via realPress in headless Chrome (CDP keyboard dispatch
      // was intercepted before reaching the page) and fell back to a synthetic
      // KeyboardEvent dispatch. Playwright's real key press reaches the tinykeys
      // handler directly.
      await page.keyboard.press("ControlOrMeta+Shift+KeyL");
      await assertDarkMode(page);
    });

    test("should persist theme selection on browser change", async ({
      page,
    }) => {
      await page.goto("/account/profile");

      const saveSetting = waitForResponseMatching(
        page,
        "PUT",
        /^\/api\/setting\/color-scheme$/,
      );
      await (await colorSchemeInput(page, "Use system default")).click();
      await popover(page).getByText("Dark", { exact: true }).click();
      await assertDarkMode(page);

      await saveSetting;

      // emulate browser change by deleting localStorage values
      await page.evaluate(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
      });

      await page.goto("/account/profile");
      await assertDarkMode(page);
    });

    test("should apply user's selected theme instead of browser's OS theme preference", async ({
      page,
    }) => {
      await page.goto("/account/profile");

      await (await colorSchemeInput(page, "Use system default")).click();
      await popover(page).getByText("Light", { exact: true }).click();

      await assertLightMode(page);

      await navigationSidebar(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await collectionTable(page)
        .getByText("Orders", { exact: true })
        .click();

      await expect(page.getByTestId("table-body")).toBeVisible(); // wait for table to be rendered

      await expect(
        getProfileLink(page).getByText("RT", { exact: true }),
      ).toHaveCSS("color", "rgba(7, 23, 34, 0.84)"); // text-dark

      await page.getByTestId("viz-type-button").click();
      await expect(
        page.getByTestId("sidebar-left").getByText("More charts", {
          exact: true,
        }),
      ).toHaveCSS("color", "rgba(7, 23, 34, 0.62)"); // text-medium

      await goToProfile(page);
      await (await colorSchemeInput(page, "Light")).click();
      await popover(page).getByText("Dark", { exact: true }).click();

      await openNavigationSidebar(page);
      await navigationSidebar(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await collectionTable(page)
        .getByText("Orders", { exact: true })
        .click();

      await expect(page.getByTestId("table-body")).toBeVisible(); // wait for table to be rendered

      await expect(
        getProfileLink(page).getByText("RT", { exact: true }),
      ).toHaveCSS("color", "rgba(255, 255, 255, 0.95)"); // text-dark

      await page.getByTestId("viz-type-button").click();
      await expect(
        page.getByTestId("sidebar-left").getByText("More charts", {
          exact: true,
        }),
      ).toHaveCSS("color", "rgba(255, 255, 255, 0.69)"); // text-medium
    });

    test("should apply user's color scheme preference immediately after login (metabase#66874)", async ({
      page,
      mb,
    }) => {
      // First, set the color scheme preference while logged in
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/account/profile");

      const saveColorScheme = waitForResponseMatching(
        page,
        "PUT",
        /^\/api\/setting\/color-scheme$/,
      );
      await (await colorSchemeInput(page, "Use system default")).click();
      await popover(page).getByText("Light", { exact: true }).click();

      await saveColorScheme;

      await assertLightMode(page);

      await mb.signOut();
      await page.goto("/");

      // Verify that the theme is restored to "auto" after sign out
      await assertDarkMode(page);

      const sessionProperties = waitForResponseMatching(
        page,
        "GET",
        /^\/api\/session\/properties$/,
      );

      // Sign-in is done manually in order to test theme replacement throughout
      // react navigation, where no new metadata is passed or injected into the
      // window object, and the theme is purely updated from session properties
      await emailInput(page).fill(email);
      await passwordInput(page).fill(password);
      await signInButton(page).click();

      await sessionProperties;

      // Verify light mode is applied immediately after login
      await assertLightMode(page);

      // Verify the theme selector shows the correct value
      await page.goto("/account/profile");
      await findByDisplayValue(page.getByRole("main"), "Light");
    });
  });
});
