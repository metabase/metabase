import type { Request } from "@playwright/test";

import { publishChanges, setEmbeddingParameter } from "../support/embedding-dashboard";
import {
  createNativeQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { expect, test } from "../support/fixtures";
import { entityPickerModal } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  codeBlock,
  getEmbedSidebar,
  visitNewEmbedPage,
} from "../support/sdk-embed-setup";
import { capturePreviewEmbedRequests } from "../support/sdk-embed-setup-guest-embed-ee";
import {
  JWT_SHARED_SECRET,
  getSimpleEmbedIframe,
  loadSdkIframeEmbedTestPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/guest-embed-oss.cy.spec.ts
 *
 * Group B (the embed SETUP wizard), guest path, `@OSS` variant. Direct sibling
 * of `tests/sdk-embed-setup-guest-embed-ee.spec.ts`; consumes
 * `support/sdk-embed-setup.ts` and `support/sdk-embed-setup-guest-embed-ee.ts`
 * READ-ONLY. No new support module was needed — the EE sibling's
 * `capturePreviewEmbedRequests` is the only spec-local helper this pair has.
 *
 * TIER — what is and is not gated (FINDINGS #49).
 * The `-ee`/`-oss` split here is an ASSERTION gate, not a describe gate. The
 * `@OSS` tag means "run on an OSS build"; the only *mechanical* difference
 * between the two specs is that `-ee` calls `activateToken("pro-self-hosted")`
 * and this one does not. On this EE jar, `mb.restore()` clears the token
 * (measured: 42 enabled `token-features` → 0), so simply omitting the
 * activation reproduces the OSS feature set exactly. There is therefore
 * NOTHING to `test.skip` — a reflexive `test.skip(!isOssBackend)` would delete
 * the very assertions that distinguish this spec from its sibling:
 *
 *   | point                       | -ee                   | -oss (here)          |
 *   | --------------------------- | --------------------- | -------------------- |
 *   | entity step `upsell-card`   | count 0               | visible              |
 *   | options step `upsell-card`  | count 0               | exists               |
 *   | "Allow downloads"           | enabled, unchecked    | DISABLED and CHECKED |
 *   | preview `embedding-footer`  | count 0               | visible              |
 *   | Guest radio                 | must be clicked       | already the default  |
 *   | SSO / Exploration / Browser | selectable            | disabled             |
 *
 * The `beforeEach` asserts the precondition (no enabled token features)
 * explicitly rather than trusting that "not calling activateToken" was enough —
 * the inverse of PORTING.md's "activateToken didn't throw is not evidence".
 *
 * THE HAZARD THAT DID NOT MATERIALISE. The EE sibling's findings (§1) reported
 * that removing `activateToken` made the flow die inside `visitNewEmbedPage`,
 * and flagged that as the single risk of this port. Probed directly on this
 * slot before writing a line: it does not reproduce. With 0 token features the
 * admin page renders `SharedCombinedEmbeddingSettings` (so
 * `guest-embeds-setting-card`, not `sdk-setting-card` — the shared helper's
 * regex already covers both), `enable-embedding-static` is true in the default
 * snapshot, and `visitNewEmbedPage` completes in ~1.4s with the Guest radio
 * pre-checked. See findings.
 *
 * Port notes (inherited from the EE sibling, same reasoning):
 * - `H.mockEmbedJsToDevServer()` dropped — the jar serves the real asset and
 *   the wizard preview never fetches `embed.js`.
 * - SNOWPLOW IS THE SUBJECT (5 `embed_wizard_*` assertions plus the `afterEach`),
 *   so rule 6's no-op stub would delete the coverage — `installSnowplowCapture`.
 * - `cy.intercept("GET", "api/preview_embed/card/*")` is read ~120 lines after
 *   it is registered, i.e. `cy.wait` consumes a PAST response; ported as the
 *   passive recorder `capturePreviewEmbedRequests`, not an armed
 *   `waitForResponse`.
 * - `.scrollIntoView()` before `should("be.visible")` is dropped: Playwright's
 *   `toBeVisible()` does not require the element to be in the viewport, so the
 *   scroll is a no-op for the assertion (and the later `.click()`s auto-scroll).
 */

const { ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Dashboard with Parameters";
const DASHBOARD_PARAMETERS = [
  { name: "ID", slug: "id", id: "11111111", type: "id" },
  { name: "Product ID", slug: "product_id", id: "22222222", type: "id" },
];

const FIRST_QUESTION_NAME = "Question With Params 1";
const SECOND_QUESTION_NAME = "Question With Params 2";

test.describe("scenarios > embedding > sdk iframe embed setup > guest-embed", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The `@OSS` precondition, asserted rather than assumed. `restore()` wipes
    // `premium-embedding-token`, so omitting `activateToken` really does leave
    // the instance feature-less — but "we didn't activate one" is not evidence
    // on a slot backend that a sibling spec may have licensed.
    const properties = (await (
      await mb.api.get("/api/session/properties")
    ).json()) as { "token-features"?: Record<string, unknown> };
    const enabledFeatures = Object.entries(properties["token-features"] ?? {})
      .filter(([, value]) => value === true)
      .map(([name]) => name);
    expect(enabledFeatures, "no token features active (@OSS)").toEqual([]);

    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);

    await mb.api.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    // Upstream aliases `dashboardId` / `question1Id` / `question2Id` here but
    // this spec's single test never reads them — the fixtures matter only as
    // entity-picker content.
    await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Orders table",
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
        parameters: DASHBOARD_PARAMETERS,
      },
    });

    await createNativeQuestion(mb.api, {
      name: FIRST_QUESTION_NAME,
      native: {
        query: "select {{text}}",
        "template-tags": {
          text: {
            id: "abc-123",
            name: "text",
            "display-name": "Text",
            type: "text",
            default: null,
          },
        },
      },
      enable_embedding: false,
    });

    await createNativeQuestion(mb.api, {
      name: SECOND_QUESTION_NAME,
      native: {
        query: "select {{text}}",
        "template-tags": {
          text1: {
            id: "abc-123",
            name: "text1",
            "display-name": "Text1",
            type: "text",
            default: null,
            required: true,
          },
          text2: {
            id: "abc-456",
            name: "text2",
            "display-name": "Text2",
            type: "text",
            default: null,
            required: false,
          },
        },
      },
      enable_embedding: true,
      embedding_params: {
        text1: "enabled",
        state2: "disabled",
      },
    });

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  // Port of upstream's `afterEach(H.expectNoBadSnowplowEvents)`. Downgraded to
  // a structural check (see support/search-snowplow.ts) — micro's Iglu schema
  // validation has no container-free equivalent.
  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test.describe("Happy path", () => {
    test("Navigates through the guest-embed flow for a question and opens its embed page", async ({
      page,
      mb,
    }) => {
      const previewEmbedRequests: Request[] = capturePreviewEmbedRequests(page);

      await visitNewEmbedPage(page);

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_opened",
      });

      await waitForSimpleEmbedIframesToLoad(page);

      // Combined experience + resource step. Unlike the EE sibling there is no
      // auth switch here: without `embedding_simple` the wizard opens on Guest
      // and everything else is locked.
      const sidebar = getEmbedSidebar(page);
      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeVisible();
      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeChecked();

      for (const label of [
        "Metabase account (SSO)",
        "Exploration",
        "Browser",
      ]) {
        await expect(sidebar.getByLabel(label, { exact: true })).toBeDisabled();
      }

      await expect(sidebar.getByTestId("upsell-card")).toBeVisible();

      await sidebar.getByText("Chart", { exact: true }).click();
      await sidebar.getByTestId("embed-browse-entity-button").click();

      const picker = entityPickerModal(page);
      await expect(
        picker.getByText("Select a chart", { exact: true }),
      ).toBeVisible();
      await picker
        .getByTestId("item-picker-level-0")
        .getByText("Our analytics", { exact: true })
        .click();
      // Scoped to the level-1 column (as the shared helper does) — the picker
      // also shows a recents list where the same name can appear. Upstream's
      // unscoped `findByText` is unique-by-construction, so this is a strict
      // narrowing that cannot change which element is picked.
      await picker
        .getByTestId("item-picker-level-1")
        .getByText(FIRST_QUESTION_NAME, { exact: true })
        .click();

      await sidebar.getByText("Next", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=chart,isDefaultExperience=false",
      });

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_resource_selection_completed",
        event_detail: "isDefaultResource=false,experience=chart",
      });

      // Options step. The EE sibling asserts downloads are ENABLED and
      // UNCHECKED at exactly this point; OSS gets the opposite, and that
      // opposition is the tier split.
      const drills = page.getByLabel(
        "Allow people to drill through on data points",
        { exact: true },
      );
      await expect(drills).toBeVisible();
      await expect(drills).toBeDisabled();

      const downloads = page.getByLabel("Allow downloads", { exact: true });
      await expect(downloads).toBeVisible();
      await expect(downloads).toBeDisabled();
      await expect(downloads).toBeChecked();

      const saveNew = page.getByLabel("Allow people to save new questions", {
        exact: true,
      });
      await expect(saveNew).toBeVisible();
      await expect(saveNew).toBeDisabled();

      // Upstream re-asserts the same three as a loop immediately afterwards.
      // Kept verbatim rather than merged (faithfulness over cleverness).
      for (const label of [
        "Allow people to drill through on data points",
        "Allow downloads",
        "Allow people to save new questions",
      ]) {
        await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
      }

      // `should("exist")` on a `findByTestId` — retrying, and unique by
      // testing-library's own contract. Page-wide here, unlike the
      // sidebar-scoped check at the entity step above.
      await expect(page.getByTestId("upsell-card")).toHaveCount(1);

      await setEmbeddingParameter(page, "Text", "Locked");
      await page
        .getByTestId("parameter-widget")
        .locator("input")
        .first()
        .fill("Foo Bar Baz");

      const previewFrame = getSimpleEmbedIframe(page);

      await expect(previewFrame.getByTestId("embedding-footer")).toBeVisible();

      const downloadWidgetButton = previewFrame.getByTestId(
        "question-download-widget-button",
      );
      await expect(downloadWidgetButton).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );

      await sidebar
        .getByTestId("appearance-section")
        .getByText("Dark", { exact: true })
        .click();

      await expect(downloadWidgetButton).toHaveCSS(
        "background-color",
        "rgb(7, 23, 34)",
      );

      await publishChanges(page, "card");
      await expect(
        page.getByRole("button", { name: "Unpublish", exact: true }),
      ).toBeVisible();

      await expect(
        previewFrame.getByText("Foo Bar Baz", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });

      await sidebar.getByText("Get code", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_options_completed",
        event_detail:
          'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=true,withAlerts=false,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":1,"enabled":0},theme=default',
      });

      // Get code step. `.invoke("text").should("match", …)` is a RETRYING
      // assertion on the CodeMirror text, so it is an `expect.poll` over
      // `innerText()` rather than a one-shot read.
      await expect
        .poll(() => codeBlock(page).first().innerText())
        .toMatch(/"theme":\s*\{\s*"preset":\s*"dark"\s*},/);

      await sidebar.getByText(/Copy code/).first().click();

      // Embed preview requests should not have "X-Metabase-Client" header
      // (EMB-945)
      await expect
        .poll(() => previewEmbedRequests.length)
        .toBeGreaterThanOrEqual(1);
      expect(
        (await previewEmbedRequests[0].allHeaders())[
          "x-metabase-embedded-preview"
        ],
      ).toBe("true");

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=chart,snippetType=frontend,guestEmbedEnabled=true,guestEmbedType=guest-embed,authSubType=none",
      });

      // Visit embed page
      const code = await codeBlock(page).first().innerText();
      const tokenMatch = code.match(/token="([^"]+)"/);
      expect(tokenMatch, "JWT token present in code block").not.toBeNull();
      const token = tokenMatch ? tokenMatch[1] : "";

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        metabaseConfig: { isGuest: true },
        elements: [
          {
            component: "metabase-question",
            attributes: { token },
          },
        ],
      });

      await expect(frame.getByText("Foo Bar Baz", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(frame.getByTestId("embedding-footer")).toBeVisible();
    });
  });
});
