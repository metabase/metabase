import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { entityPickerModal } from "./notebook";
import { modal } from "./ui";

/**
 * Port of the spec-local helper shared by the 13 specs under
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/
 * i.e. `.../sdk-iframe-embedding-setup/helpers/index.ts`, plus the two
 * `e2e-embedding-iframe-sdk-setup-helpers.ts` helpers those specs reach for
 * through `H` (`embedModalEnableEmbedding`, `embedModalContent`).
 *
 * WHY THIS IS A SEPARATE MODULE FROM `support/sdk-iframe.ts`.
 * The findings for the sdk-iframe harness (findings-inbox/sdk-iframe-harness.md
 * §5) established that this directory is a *different tier* from
 * `sdk-iframe-embedding/`: these specs never build a customer HTML page and
 * never load `embed.js` themselves. They are ordinary admin-UI tests that visit
 * `/admin/embedding`, click "New embed", and drive the setup wizard inside a
 * full-screen Mantine modal. The embed preview shown in the wizard's right-hand
 * panel is rendered by the app itself (`SdkIframeEmbedPreview`), which imports
 * the embed runtime directly rather than loading the script — but it still
 * produces a real `iframe[data-metabase-embed]`, so the *iframe accessors* in
 * `support/sdk-iframe.ts` (`getSimpleEmbedIframe`,
 * `waitForSimpleEmbedIframesToLoad`) apply unchanged. Those are consumed
 * read-only from the specs; nothing here duplicates them.
 *
 * `mockEmbedJsToDevServer()` — called in every one of these specs' beforeEach —
 * is dropped for the same reason it was dropped from `sdk-iframe.ts`: it exists
 * only to redirect `embed.js` at the rspack dev server for hot reload, and the
 * jar (the default verification artifact) serves the real asset. Here it is
 * even more clearly inert, since the wizard preview does not fetch `embed.js`
 * at all.
 *
 * PORT SHAPE FOR THE TWO ALIAS-READING ASSERTIONS. Upstream's
 * `assertRecentItemName` / `assertDashboard` read a `cy.intercept(...).as()`
 * alias registered in a `beforeEach`. Playwright has no retroactive alias
 * (PORTING.md rule 2), so they are ported as pure assertions over an already
 * awaited response body; the spec arms its own `waitForResponse` before the
 * action that triggers it. That is a mechanical inversion, not a weakening —
 * if anything it is stronger, since a `cy.get("@alias")` that never fired
 * fails with a confusing "no alias" error at an arbitrary later point.
 */

// === locators ============================================================

/**
 * Port of `getEmbedSidebar`.
 *
 * Upstream: `modal().first().within(() => cy.findByRole("complementary"))`.
 * The wizard's sidebar is `<Box component="aside">` inside
 * `SdkIframeEmbedSetupModal`'s full-screen Mantine `Modal`, so `aside` →
 * implicit ARIA role `complementary`. `.first()` is kept: Mantine can leave a
 * second `[role=dialog][aria-modal]` mounted (the entity picker, the legacy
 * static-embedding modal), and upstream pins the wizard by taking the first.
 *
 * ⚠️ KNOWN SCOPE DISCREPANCY (found by `common-ee`, 2026-07-20).
 * Cypress's `.within()` yields its ORIGINAL subject, so upstream's
 * `getEmbedSidebar()` actually returns the **modal**, not the sidebar — every
 * upstream `getEmbedSidebar().within(...)` is modal-scoped. This port returns
 * the `<aside>`, which is NARROWER.
 *
 * Deliberately left as-is: the aside is inside the modal, so the narrowing is
 * invisible for the sidebar controls every spec actually uses, and widening it
 * now would risk strict-mode violations across the nine specs where the
 * aside-scoped locator is currently unique.
 *
 * It bites when a `.within()` block reaches for something in the modal but
 * OUTSIDE the aside — notably the **preview iframe**. `common-ee` hit exactly
 * that and handled it locally with page-scoped iframe helpers. If you need
 * modal scope, use `modal(page).first()` directly rather than widening this.
 *
 * ✅ AUDIT CLOSED 2026-07-20 — no other spec is affected.
 * `user-settings-persistence`: never calls this helper.
 * `select-embed-options`: audited past `.within()` blocks (the discrepancy
 * applies to ANY chained descendant lookup, not just `.within()`); all 6 sites
 * touch sidebar controls only, and the two absence checks ("Reset colors" ×2)
 * are self-anchored — the same test asserts the element visible in the same
 * scope, proving it is inside the aside. Empirically backed: that port runs
 * 21/21 green with the narrow helper. See
 * `findings-inbox/get-embed-sidebar-scope-audit-verdict.md`.
 */
export function getEmbedSidebar(page: Page): Locator {
  return modal(page).first().getByRole("complementary");
}

/** Port of `getResourceSelectorButton`. Upstream takes a Cypress
 * `Timeoutable`; Playwright timeouts are per-assertion, so callers that need a
 * longer wait pass `{ timeout }` to the assertion instead. */
export function getResourceSelectorButton(page: Page): Locator {
  return page.getByTestId("embed-browse-entity-button");
}

/** Port of `codeBlock`: the CodeMirror content of the generated snippet. */
export function codeBlock(page: Page): Locator {
  return page.locator(".cm-content");
}

/** Port of H.embedModalContent. */
export function embedModalContent(page: Page): Locator {
  return page.getByTestId("sdk-iframe-embed-setup-modal-content");
}

/** Port of H.embedModalEnableEmbeddingCard. */
export function embedModalEnableEmbeddingCard(page: Page): Locator {
  return page.getByTestId("enable-embedding-card");
}

/** The wizard preview's loaded-iframe marker — `visitNewEmbedPage` gates on it,
 * and several specs assert it directly. */
export function loadedPreviewIframe(page: Page): Locator {
  return page.locator("[data-iframe-loaded]");
}

// === the terms-acceptance gate ===========================================

/**
 * Port of H.embedModalEnableEmbedding
 * (e2e/support/helpers/e2e-embedding-iframe-sdk-setup-helpers.ts).
 *
 * Upstream is a `cy.get("body").then($body => …)` — a one-shot synchronous DOM
 * probe: if no `enable-embedding-card` is mounted, the terms were already
 * accepted, the section bails out via `showSection` and never renders, so this
 * is a no-op. Otherwise it clicks the *actionable* Agree/Enable button.
 *
 * Two things the port must get right, both of which upstream's own comment
 * spells out:
 *
 * 1. It must NOT treat the disabled "Enabled" label as a terminal no-op. That
 *    label legitimately appears after this helper clicks Agree (the section
 *    freezes via `useState`) but ALSO appears transiently on the *stale*
 *    section left over from a previous auth-mode selection, before React
 *    commits the unmount. Matching only the actionable label scopes us to the
 *    freshly mounted section for free.
 * 2. The probe is one-shot, so it needs something to have settled first.
 *    Cypress gets this from its command queue (the preceding `.click()` has to
 *    resolve). Playwright fires back-to-back, so the port waits for the wizard
 *    modal content — present in BOTH branches — before counting the card.
 *    Without it the "card absent" branch is a race that silently skips a
 *    needed click, and the failure surfaces much later as "preview never
 *    loaded".
 */
export async function embedModalEnableEmbedding(page: Page) {
  await expect(embedModalContent(page)).toBeVisible();

  if ((await embedModalEnableEmbeddingCard(page).count()) === 0) {
    return;
  }

  await page
    .getByRole("button", {
      name: /(Agree and (continue|enable)|Enable and continue)/,
    })
    .click();
}

// === navigation ==========================================================

const DASHBOARD_PATH_RE = /^\/api\/dashboard\/\d+/;

/** Arms a wait for the wizard's dashboard fetch. Exported because several
 * specs need to await the same response for their own assertions
 * (`assertDashboard`), and rule 2 requires arming before the trigger. */
export function waitForWizardDashboard(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      DASHBOARD_PATH_RE.test(new URL(response.url()).pathname),
  );
}

/** Arms a wait for `GET /api/activity/recents?…` (upstream's `@recentActivity`
 * alias). */
export function waitForRecentActivity(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/activity/recents",
  );
}

/**
 * Port of `visitNewEmbedPage`.
 *
 * Upstream registers `cy.intercept("GET", "/api/dashboard/*").as("dashboard")`
 * here and `cy.wait("@dashboard")`s after accepting the terms. The Playwright
 * inversion: the wait is armed before the "New embed" click that ultimately
 * triggers it, and only when `waitForResource` is set — a never-awaited
 * `waitForResponse` promise would reject unhandled after the timeout.
 */
export async function visitNewEmbedPage(
  page: Page,
  { waitForResource = true }: { waitForResource?: boolean } = {},
) {
  await page.goto("/admin/embedding");

  const dashboard = waitForResource ? waitForWizardDashboard(page) : null;

  await page
    .getByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)
    .first()
    .getByText("New embed", { exact: true })
    .click();

  if (dashboard) {
    await embedModalEnableEmbedding(page);
    await dashboard;
    await expect(loadedPreviewIframe(page)).toHaveCount(1, {
      timeout: 20_000,
    });
  }
}

export type NavigateToStepOptions =
  | {
      experience: "exploration" | "metabot";
      resourceName?: never;
      preselectSso?: boolean;
      preselectGuest?: boolean;
    }
  | {
      experience: "dashboard" | "chart" | "browser";
      resourceName: string;
      preselectSso?: boolean;
      preselectGuest?: boolean;
    };

const EXPERIENCE_CARD_LABEL: Record<string, string | undefined> = {
  chart: "Chart",
  exploration: "Exploration",
  browser: "Browser",
  metabot: "Metabot",
};

const RESOURCE_TYPE_BY_EXPERIENCE: Record<string, string> = {
  dashboard: "Dashboards",
  chart: "Questions",
  browser: "Collections",
};

/**
 * Port of `navigateToEntitySelectionStep`.
 *
 * Faithful down to upstream's `ensureAuthMode` comment: switching auth mode
 * re-mounts the terms section, but when we are ALREADY on the requested mode
 * (SSO is the default) the radio click is a no-op and the section's terms were
 * already accepted by `visitNewEmbedPage`'s `embedModalEnableEmbedding()` — so
 * calling the helper again would race the now-frozen disabled "Enabled" button.
 *
 * `cy.findByLabelText("Metabase account (SSO)")` is an EXACT match in
 * testing-library (PORTING.md rule 1) → `getByLabel(..., { exact: true })`.
 * `cy.findByText(<experience card label>)` is likewise exact; it is additionally
 * scoped to the sidebar here. That is a strict narrowing of a selector upstream
 * proves unique (testing-library's `findByText` throws on multiple matches), so
 * it cannot change which element is picked — it only removes the chance of a
 * Playwright strict-mode violation if the same word renders in the preview
 * panel.
 */
export async function navigateToEntitySelectionStep(
  page: Page,
  options: NavigateToStepOptions,
) {
  const { experience, preselectSso, preselectGuest } = options;

  await visitNewEmbedPage(page);

  const isQuestionOrDashboardExperience =
    experience === "chart" || experience === "dashboard";
  const hasEntitySelection =
    experience !== "exploration" && experience !== "metabot";

  const ensureAuthMode = async (label: string) => {
    const radio = getEmbedSidebar(page).getByLabel(label, { exact: true });
    if (await radio.isChecked()) {
      return;
    }
    await radio.click();
    await embedModalEnableEmbedding(page);
  };

  if (preselectSso || !isQuestionOrDashboardExperience) {
    await ensureAuthMode("Metabase account (SSO)");
  } else if (preselectGuest) {
    await ensureAuthMode("Guest");
  }

  const labelByExperience = EXPERIENCE_CARD_LABEL[experience];

  if (labelByExperience) {
    await getEmbedSidebar(page)
      .getByText(labelByExperience, { exact: true })
      .click();
  }

  // Experience selection and resource picker are part of the same step;
  // exploration and metabot do not show a resource picker.
  if (hasEntitySelection && options.resourceName) {
    const { resourceName } = options;

    await getEmbedSidebar(page)
      .getByTestId("embed-browse-entity-button")
      .click();

    // The picker opens on the "Recent items" tab by default. Scope each
    // navigation step to its column to disambiguate when the target also
    // appears in the recents list.
    const picker = entityPickerModal(page);
    await picker
      .getByTestId("item-picker-level-0")
      .getByText("Our analytics", { exact: true })
      .click();
    await picker
      .getByTestId("item-picker-level-1")
      .getByText(resourceName, { exact: true })
      .first()
      .click();

    // The collection picker requires an explicit confirmation.
    if (experience === "browser") {
      await entityPickerModal(page)
        .getByText("Select", { exact: true })
        .click();
    }

    // The resource's title should be visible in the sidebar by default.
    await expect(
      getEmbedSidebar(page).getByText(resourceName, { exact: true }),
    ).toBeVisible();
  }

  return RESOURCE_TYPE_BY_EXPERIENCE[experience] ?? "";
}

/** Port of `navigateToEmbedOptionsStep`. */
export async function navigateToEmbedOptionsStep(
  page: Page,
  options: NavigateToStepOptions,
) {
  await navigateToEntitySelectionStep(page, options);

  await getEmbedSidebar(page).getByText("Next", { exact: true }).click();
}

/** Port of `navigateToGetCodeStep`. */
export async function navigateToGetCodeStep(
  page: Page,
  options: NavigateToStepOptions,
) {
  await navigateToEmbedOptionsStep(page, options);

  await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();
}

/**
 * Port of `completeWizard`.
 *
 * UNEXERCISED, and deliberately so: `completeWizard` is dead code upstream —
 * it is defined in `helpers/index.ts` and imported by none of the 13 specs. A
 * probe against the jar showed why it never got used: the "Done" button is
 * `disabled={resource?.enable_embedding === false}`
 * (`SdkIframeEmbedSetupModal.tsx`), and the sample "Orders in a dashboard" has
 * embedding disabled, so on the SSO path the button renders permanently
 * disabled. Ported for completeness; if a future spec needs it, that spec must
 * first put the resource into an embeddable state. NOT a product-bug claim —
 * no spec asserts otherwise.
 */
export async function completeWizard(
  page: Page,
  options: NavigateToStepOptions,
) {
  await navigateToGetCodeStep(page, options);

  await getEmbedSidebar(page).getByText("Done", { exact: true }).click();
}

// === assertions over intercepted bodies ==================================

type RecentsBody = { recents?: { model: string; name: string }[] };

/**
 * Port of `assertRecentItemName`. Upstream reads the `@recentActivity` alias;
 * here the caller awaits `waitForRecentActivity(page)` (armed before the
 * triggering navigation) and passes the parsed body.
 */
export function assertRecentItemName(
  body: RecentsBody,
  model: "dashboard" | "card",
  resourceName: string,
) {
  const recentItem = body.recents?.filter(
    (recent) => recent.model === model,
  )?.[0];

  expect(recentItem?.name).toBe(resourceName);
}

/** Port of `assertDashboard`. Same alias→awaited-body inversion. */
export function assertDashboard(
  body: { id?: number; name?: string },
  { id, name }: { id: number; name: string },
) {
  expect(body.id).toBe(id);
  expect(body.name).toBe(name);
}

// === fixture helper ======================================================

/**
 * Port of the `logRecent` helper duplicated in select-embed-entity /
 * select-embed-experience: seeds the recents list so the wizard's default
 * resource selection is deterministic.
 */
export async function logRecent(
  api: { post(url: string, data?: unknown): Promise<unknown> },
  model: "dashboard" | "card",
  modelId: number | string,
) {
  await api.post("/api/activity/recents", {
    context: "selection",
    model,
    model_id: modelId,
  });
}
