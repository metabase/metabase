import type { Request } from "@playwright/test";

import {
  assertEmbeddingParameter,
  publishChanges,
  setEmbeddingParameter,
} from "../support/embedding-dashboard";
import {
  createNativeQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { expect, test } from "../support/fixtures";
import { entityPickerModal } from "../support/notebook";
import { unpublishChanges } from "../support/public-sharing-embed-button-behavior";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  codeBlock,
  embedModalEnableEmbedding,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  visitNewEmbedPage,
} from "../support/sdk-embed-setup";
import { capturePreviewEmbedRequests } from "../support/sdk-embed-setup-guest-embed-ee";
import {
  JWT_SHARED_SECRET,
  enableJwtAuth,
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
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/guest-embed-ee.cy.spec.ts
 *
 * Group B (the embed SETUP wizard) on the GUEST auth path. Consumes
 * `support/sdk-embed-setup.ts` read-only; the only new code is the passive
 * `preview_embed` request recorder in
 * `support/sdk-embed-setup-guest-embed-ee.ts`.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header):
 *   jar mode serves the real `app/embed.js`.
 * - SNOWPLOW IS THE SUBJECT of the happy-path test (5 `embed_wizard_*`
 *   assertions) and `afterEach` asserts no bad events, so rule 6's no-op stub
 *   would delete the coverage — this uses `installSnowplowCapture`, as
 *   `sdk-embed-setup-get-code.spec.ts` does. `H.enableTracking()` is still
 *   issued so the backend state matches upstream.
 * - `cy.intercept("GET", "api/preview_embed/card/*").as("previewEmbed")` is a
 *   *retroactive* `cy.wait` (registered ~100 lines before it is read), so it is
 *   ported as a passive recorder rather than an armed `waitForResponse` — see
 *   `capturePreviewEmbedRequests`.
 * - `should("not.exist")` RETRIES upstream and passes at the first absent
 *   observation; `expect(loc).toHaveCount(0)` does the same, so it is the
 *   faithful port. (An earlier revision used the non-retrying
 *   `expect(await loc.count()).toBe(0)`, which samples one instant and is
 *   *stricter* than upstream — see PORTING.md.) What actually matters for
 *   these is the anchor, below.
 * - Cypress chains carry an implicit existence assertion on their anchor
 *   (`H.getSimpleEmbedIframeContent().findByTestId(x).should("not.exist")`
 *   asserts the iframe exists *and* has no footer). The anchors are asserted
 *   separately here so the absence half cannot pass vacuously.
 * - TIER: this is the `-ee` variant. There is no `@OSS`/EE-only describe tag —
 *   upstream's whole EE-ness is `H.activateToken("pro-self-hosted")`, which the
 *   `-oss` sibling omits. So there is nothing to gate on and no `test.skip`
 *   here; all 3 tests execute. (See findings.)
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
  let dashboardId: number;
  let question1Id: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);

    await mb.api.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    const { dashboardId: createdDashboardId } =
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
    dashboardId = createdDashboardId;

    const question1 = await createNativeQuestion(mb.api, {
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
    question1Id = question1.id;

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

      // Switch to Guest auth (wizard now defaults to SSO when SSO isn't
      // configured)
      const sidebar = getEmbedSidebar(page);
      await sidebar.getByLabel("Guest", { exact: true }).click();
      await embedModalEnableEmbedding(page);

      // Combined experience + resource step
      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeVisible();
      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeChecked();

      await expect(sidebar.getByTestId("upsell-card")).toHaveCount(0);

      await sidebar.getByText("Chart", { exact: true }).click();
      await sidebar.getByTestId("embed-browse-entity-button").click();

      const picker = entityPickerModal(page);
      await picker
        .getByTestId("item-picker-level-0")
        .getByText("Our analytics", { exact: true })
        .click();

      await expect(
        picker.getByText("Select a chart", { exact: true }),
      ).toBeVisible();
      // Scoped to the level-1 column (as the shared helper does) — the picker
      // also shows a recents list where the same name can appear.
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

      // Options step
      await expect(page.getByLabel("Guest", { exact: true })).toHaveCount(0);

      const drills = page.getByLabel(
        "Allow people to drill through on data points",
        { exact: true },
      );
      await expect(drills).toBeVisible();
      await expect(drills).toBeDisabled();

      const downloads = page.getByLabel("Allow downloads", { exact: true });
      await expect(downloads).toBeVisible();
      await expect(downloads).not.toBeDisabled();
      await expect(downloads).not.toBeChecked();

      const saveNew = page.getByLabel("Allow people to save new questions", {
        exact: true,
      });
      await expect(saveNew).toBeVisible();
      await expect(saveNew).toBeDisabled();

      await expect(sidebar.getByTestId("behavior-docs-link")).toBeVisible();
      await expect(sidebar.getByTestId("behavior-docs-link")).toHaveAttribute(
        "href",
        /embedding\/guest-embedding/,
      );

      await setEmbeddingParameter(page, "Text", "Locked");
      await page
        .getByTestId("parameter-widget")
        .locator("input")
        .first()
        .fill("Foo Bar Baz");

      await expect(sidebar.getByTestId("upsell-card")).toHaveCount(0);

      await publishChanges(page, "card");
      await expect(
        page.getByRole("button", { name: "Unpublish", exact: true }),
      ).toBeVisible();

      const previewFrame = getSimpleEmbedIframe(page);
      await expect(
        previewFrame.getByText("Foo Bar Baz", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });

      await expect(previewFrame.getByTestId("embedding-footer")).toHaveCount(0);

      await sidebar.getByText("Get code", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_options_completed",
        event_detail:
          'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withAlerts=false,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":1,"enabled":0},theme=default',
      });

      // Get code step
      await expect(sidebar.getByTestId("publish-guest-embed-link")).toHaveCount(
        0,
      );

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

      await unpublishChanges(page, "card");

      await expect(
        sidebar.getByTestId("publish-guest-embed-link"),
      ).toBeVisible();
      await expect(sidebar.getByText(/Copy code/)).toHaveCount(0);

      await publishChanges(page, "card");

      // ANCHOR — do not remove. `publishChanges` resolves on the PUT
      // *response*, before the sidebar re-renders, so an absence taken right
      // here would pass against the pre-render DOM (vacuous) rather than
      // against the published state. Gate on the mirror state — the empty
      // state carrying `publish-guest-embed-link` is replaced by the code
      // block, so "Copy code" visible ⟺ the link is gone. Upstream reaches the
      // same state one command later (`findAllByText(/Copy code/).click()`).
      await expect(sidebar.getByText(/Copy code/).first()).toBeVisible();

      await expect(sidebar.getByTestId("publish-guest-embed-link")).toHaveCount(
        0,
      );

      await sidebar
        .getByText(/Copy code/)
        .first()
        .click();

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

      await expect(frame.getByText("Foo Bar Baz", { exact: true })).toBeVisible(
        {
          timeout: 20_000,
        },
      );
      await expect(frame.getByTestId("embedding-footer")).toHaveCount(0);
    });

    test("Properly re-initializes embedding parameters and Guest Embed navbar", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/card/${question1Id}`, {
        enable_embedding: true,
      });

      await navigateToEmbedOptionsStep(page, {
        experience: "chart",
        resourceName: FIRST_QUESTION_NAME,
        preselectGuest: true,
      });

      const unpublish = page.getByRole("button", {
        name: "Unpublish",
        exact: true,
      });
      await expect(unpublish).toBeVisible();

      await assertEmbeddingParameter(page, "Text", "Disabled");

      const sidebar = getEmbedSidebar(page);
      await sidebar.getByText("Back", { exact: true }).click();
      await sidebar.getByTestId("embed-browse-entity-button").click();

      await entityPickerModal(page)
        .getByTestId("item-picker-level-0")
        .getByText("Our analytics", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText(SECOND_QUESTION_NAME, { exact: true })
        .first()
        .click();

      await sidebar.getByText("Next", { exact: true }).click();

      await expect(unpublish).toBeVisible();

      await assertEmbeddingParameter(page, "Text1", "Editable");
      await assertEmbeddingParameter(page, "Text2", "Disabled");

      await setEmbeddingParameter(page, "Text1", "Locked");

      await expect(
        page.getByRole("button", { name: "Publish changes", exact: true }),
      ).toBeVisible();

      await sidebar.getByText("Back", { exact: true }).click();
      await sidebar.getByTestId("embed-browse-entity-button").click();

      await entityPickerModal(page)
        .getByTestId("item-picker-level-0")
        .getByText("Our analytics", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText(FIRST_QUESTION_NAME, { exact: true })
        .first()
        .click();

      await sidebar.getByText("Next", { exact: true }).click();

      await expect(unpublish).toBeVisible();

      await assertEmbeddingParameter(page, "Text", "Disabled");
    });

    test("Properly adjusts EmbedJS options when switching between guest/sso modes for a Dashboard", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        enable_embedding: true,
      });

      await enableJwtAuth(mb);

      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: DASHBOARD_NAME,
        preselectGuest: true,
      });

      const sidebar = getEmbedSidebar(page);
      await expect(sidebar.getByLabel("Guest", { exact: true })).toHaveCount(0);

      await setEmbeddingParameter(page, "Product ID", "Locked");

      await sidebar.getByText("Get code", { exact: true }).click();

      const code = codeBlock(page).first();
      await expect(code).toContainText("token=");
      await expect(code).not.toContainText("dashboard-id=");
      await expect(code).not.toContainText("hidden-parameters=");
      await expect(code).not.toContainText("locked-parameters=");

      await sidebar.getByText("Back", { exact: true }).click();
      await sidebar.getByText("Back", { exact: true }).click();

      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeVisible();
      await expect(sidebar.getByLabel("Guest", { exact: true })).toBeChecked();

      await sidebar
        .getByLabel("Metabase account (SSO)", { exact: true })
        .click();

      await embedModalEnableEmbedding(page);

      await sidebar.getByText("Next", { exact: true }).click();
      await sidebar.getByText("Get code", { exact: true }).click();

      await expect(codeBlock(page).first()).toContainText("dashboard-id=");

      // hiddenParameters is reset to [] when switching from guest to SSO mode,
      // so hidden-parameters= should not appear in the code.
      await expect(codeBlock(page).first()).not.toContainText(
        "hidden-parameters=",
      );

      await expect(codeBlock(page).first()).not.toContainText("token=");
      await expect(codeBlock(page).first()).not.toContainText(
        "locked-parameters=",
      );
    });
  });
});
