/**
 * Helpers for the first-run setup-flow port
 * (e2e/test/scenarios/onboarding/setup/setup.cy.spec.ts).
 *
 * New module per PORTING rule 9; every import from a shared support module is
 * read-only. Module name matches the target spec (tests/onboarding-setup.spec.ts).
 *
 * The unusual thing about this spec: every test runs against a **blank,
 * un-set-up instance** (`H.restore("blank")`) and then drives the real setup
 * wizard to completion. See `restoreBlank` below for why `mb.restore()` itself
 * cannot be used for that.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/**
 * Restore the `blank` snapshot — an app DB with no users, no databases and
 * setup not yet completed.
 *
 * Deliberately calls `mb.api.restore()` rather than `mb.restore()`. The harness
 * wrapper (support/fixtures.ts) does two things after the raw restore that are
 * both wrong for a blank instance:
 *
 *  1. it polls `/api/search?...` with the *cached admin session*, which does
 *     not exist on a blank instance — 30s of dead polling per test; and
 *  2. it `PUT`s `/api/database/1` to re-point the sample database at the
 *     worker's private H2 copy. On a blank instance there is no database 1 and
 *     no admin session, so that request 4xxs and — since `restore()` does not
 *     pass `failOnStatusCode: false` there — **throws**.
 *
 * Neither is needed here: there is nothing to search, and the sample database
 * is only created if a test clicks "Continue with sample data", at which point
 * the backend builds it inside this slot's private
 * `MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR` (support/worker-backend.ts) rather
 * than the shared `e2e/tmp` file. So there is no cross-slot H2 contention to
 * work around.
 *
 * Shared modules are not edited (porting rule 9) — this is a local call into
 * the existing public API surface, not a fork of the wrapper.
 */
export async function restoreBlank(api: MetabaseApi) {
  await api.restore(process.env.PW_BLANK_SNAPSHOT ?? "blank");
}

/** `cy.findByTestId("setup-forms")`. */
export function setupForms(page: Page): Locator {
  return page.getByTestId("setup-forms");
}

/**
 * `cy.type()` fires a real key event per character and re-resolves its subject
 * each time; `fill()` sets `.value` in one shot. The setup form is Formik with
 * cross-field validation (confirm-password is `oneOf([ref("password")])`) and
 * a submit gated on validity, so type the way upstream does.
 */
export async function typeInto(locator: Locator, text: string) {
  await locator.click();
  await locator.pressSequentially(text);
}

/** `.clear().type(text)` */
export async function clearAndType(locator: Locator, text: string) {
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(text);
}

/**
 * NOTE for anyone extending this port: `installSnowplowCapture`
 * (support/search-snowplow.ts) and `mockSessionProperties`
 * (support/onboarding-extras.ts) BOTH route `/api/session/properties`, and
 * Playwright resolves routes last-registered-first *without* chaining — so a
 * test that needs both would silently lose the first one's rewrites. No test
 * here needs both (the only snowplow assertion in a session-property-mocking
 * test, `invite_sent`, is backend-emitted and observed on the per-slot
 * collector instead), but a combined route is the fix if one ever does.
 */

/** Port of the spec's `skipWelcomePage`. */
export async function skipWelcomePage(page: Page) {
  const welcome = page.getByTestId("welcome-page");
  await expect(
    welcome.getByText("Welcome to Metabase", { exact: true }),
  ).toBeVisible();
  await welcome.getByText("Let's get started", { exact: true }).click();
}

type UserFields = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  password?: string | null;
  company_name?: string | null;
};

/** Port of the spec's `fillUserAndContinue`. Call with `setupForms(page)`. */
export async function fillUserAndContinue(
  forms: Locator,
  { email, first_name, last_name, password, company_name }: UserFields,
) {
  await expect(
    forms.getByText("What should we call you?", { exact: true }),
  ).toBeVisible();

  if (first_name) {
    await typeInto(forms.getByLabel("First name", { exact: true }), first_name);
  }
  if (last_name) {
    await typeInto(forms.getByLabel("Last name", { exact: true }), last_name);
  }
  if (email) {
    await typeInto(forms.getByLabel("Email", { exact: true }), email);
  }
  if (company_name) {
    await typeInto(
      forms.getByLabel("Company or team name", { exact: true }),
      company_name,
    );
  }
  if (password) {
    await typeInto(
      forms.getByLabel("Create a password", { exact: true }),
      password,
    );
    await typeInto(
      forms.getByLabel("Confirm your password", { exact: true }),
      password,
    );
  }
  await forms.getByRole("button", { name: "Next", exact: true }).click();
}

/** Port of the spec's `skipLicenseStepOnEE`. Call with `setupForms(page)`. */
export async function skipLicenseStepOnEE(
  scope: Locator,
  isEnterprise: boolean,
) {
  if (!isEnterprise) {
    return;
  }
  await expect(
    scope.getByText("Activate your commercial license", { exact: true }),
  ).toBeVisible();
  await scope
    .getByRole("button", { name: "I'll activate later", exact: true })
    .click();
}

/**
 * Port of the spec's `typeToken`. Upstream flips the input to `type=password`
 * so the token never lands in a failure screenshot, and silences request
 * logging; keep the first (it is the part with a security purpose) and drop
 * the `cy.intercept({ log: false })`, which has no Playwright analogue.
 */
export async function typeToken(scope: Locator, token: string) {
  const input = scope.getByLabel("Token", { exact: true });
  await input.evaluate((element) =>
    element.setAttribute("type", "password"),
  );
  await input.click();
  await input.pressSequentially(token);
}

/**
 * Port of the spec's `navigateToDatabaseStep`: visit /setup with the user
 * pre-filled via query params, set a password, skip the usage questionnaire.
 */
export async function navigateToDatabaseStep(page: Page) {
  await page.goto(
    "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited",
  );

  await skipWelcomePage(page);

  const forms = setupForms(page);
  const password = "12341234";
  const createPassword = forms.getByLabel("Create a password", {
    exact: true,
  });
  // Upstream: `.should("be.empty").type(password)`. `be.empty` on an <input>
  // asserts the element has no CHILD NODES, which is vacuous for a void
  // element — it can never fail. Ported as the assertion it was reaching for.
  await expect(createPassword).toHaveValue("");
  await typeInto(createPassword, password);
  await typeInto(
    forms.getByLabel("Confirm your password", { exact: true }),
    password,
  );
  await forms.getByRole("button", { name: "Next", exact: true }).click();

  // Just go through the usage questionnaire
  await expect(
    forms.getByLabel("What will you use Metabase for?", { exact: true }),
  ).toBeVisible();
  await forms.getByRole("button", { name: "Next", exact: true }).click();
}

/**
 * Port of the spec's `selectLanguage`. The translations request is registered
 * before the click that triggers it (porting rule 2).
 */
export async function selectLanguage(page: Page, targetLanguage: string) {
  await page.getByTestId("language-selector").click();

  const translations =
    targetLanguage === "English"
      ? null
      : page.waitForResponse((response) =>
          new URL(response.url()).pathname.startsWith("/app/locales/"),
        );

  const option = page
    .locator("[role='option']")
    .filter({ hasText: new RegExp(`^${escapeRegExp(targetLanguage)}$`) });
  await option.scrollIntoViewIfNeeded();
  await expect(option).toBeVisible();
  await option.click();

  await translations;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `cy.findByText("Need help connecting?").should("not.be.visible")`.
 *
 * NOT `toBeHidden()`. `SetupCardContainer` only uses `display: none` below the
 * `breakpointMinLarge` (80em = 1280px) media query; at or above it the card is
 * `position: fixed` with `transform: translateY(200%)`, i.e. still displayed
 * but pushed off the bottom of the viewport. The Playwright viewport is
 * exactly 1280x800, so the large branch applies and `toBeHidden()` would
 * FAIL — Playwright's hidden means display:none / visibility:hidden / empty
 * box, none of which hold. Cypress's `not.be.visible` catches it because for
 * `position: fixed` elements Cypress falls back to an occlusion /
 * out-of-viewport test.
 *
 * So assert what Cypress actually asserts: hidden, or positioned outside the
 * viewport. Polled, because the container animates over 0.4s.
 *
 * VERIFIED BY MUTATION (slot 4105, jar 751c2a9). The runtime viewport measures
 * 1280x**720** — playwright.config.ts declares 800, but `page.viewportSize()`
 * reports 720, so the numbers below are the measured ones. The width is what
 * matters for the breakpoint (80em = 1280px), so the large branch does apply.
 * Geometry of the "Need help connecting?" text, both states `isVisible()=true`
 * to Playwright:
 *     before a DB is selected (hidden):  y = 860  -> below the fold, passes
 *     after a DB is selected  (shown):   y = 574  -> within the fold, fails
 * so this helper genuinely discriminates rather than passing vacuously.
 *
 * CAVEAT found while mutating: `expect.poll(...).not.toBe("onscreen")` is
 * satisfied by the FIRST sample that is offscreen, so calling this immediately
 * after the click that reveals the card passes on the transient pre-animation
 * position (measured y = 847 at that instant). Inserting a 1.2s settle before
 * the call kills the mutant. Upstream's `should("not.be.visible")` retries
 * until satisfied in exactly the same way, so this is a faithful port of the
 * weakness, not one introduced here — but do not use this helper to prove a
 * card *stays* hidden over time without settling first.
 */
export async function expectSetupCardNotVisible(page: Page, locator: Locator) {
  await expect
    .poll(
      async () => {
        if ((await locator.count()) === 0) {
          return "absent";
        }
        if (!(await locator.first().isVisible())) {
          return "absent";
        }
        const box = await locator.first().boundingBox();
        if (box == null) {
          return "absent";
        }
        const viewport = page.viewportSize();
        if (viewport == null) {
          return "unknown-viewport";
        }
        const offscreen =
          box.y >= viewport.height ||
          box.y + box.height <= 0 ||
          box.x >= viewport.width ||
          box.x + box.width <= 0;
        return offscreen ? "offscreen" : "onscreen";
      },
      {
        timeout: 10_000,
        message:
          "expected the setup help card to be hidden or pushed out of the viewport",
      },
    )
    .not.toBe("onscreen");
}

/** `cy.location("pathname").should("eq", expected)` — retried, per PORTING. */
export async function expectPathname(page: Page, expected: string) {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
    .toBe(expected);
}

/** The last `<section>` on the page — upstream's `cy.get("section").last()`. */
export function lastSection(page: Page): Locator {
  return page.locator("section").last();
}
