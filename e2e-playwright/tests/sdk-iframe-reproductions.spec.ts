import { expect, test } from "../support/fixtures";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  getSimpleEmbedIframe,
  prepareSdkIframeEmbedTest,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { tableInteractive } from "../support/sdk-iframe-embedding";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/reproductions.cy.spec.ts
 *
 * Group A — the `embed.js` customer-page harness in `support/sdk-iframe.ts`,
 * consumed read-only. No companion support module was needed; `tableInteractive`
 * is imported from the sibling `sdk-iframe-embedding.ts` port rather than
 * re-declared.
 *
 * Port notes:
 *
 * - Upstream builds the page by hand with `visitCustomHtmlPage` +
 *   `getNewEmbedScriptTag()` (default `loadType: "defer"`) rather than going
 *   through `loadSdkIframeEmbedTestPage` (which forces `"sync"`). That
 *   difference is preserved: the script tag is emitted with the default here
 *   too.
 *
 * - `H.getSimpleEmbedIframeContent()` blocks until the embed iframe exists and
 *   its body is non-empty; the Playwright `getSimpleEmbedIframe` returns a lazy
 *   `FrameLocator` immediately, so `waitForSimpleEmbedIframesToLoad` restores
 *   that gate (same as the landed metabase-browser port).
 *
 * - The closing `should("not.exist")` is ported as retrying `toHaveCount(0)`
 *   (identical semantics — PORTING, "Absence assertions"). It is preceded by
 *   two positive anchors that hold in BOTH the fixed and the broken variant, so
 *   it cannot pass merely because the table has not re-rendered yet: the
 *   checkbox has flipped to unchecked, and the table still shows "Subtotal".
 *   Vacuity was disproved by inversion — see findings.
 */

test.describe("issue 77135", () => {
  test("should add/remove columns via viz settings (EMB-2057)", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "bleeding-edge",
      signOut: false,
    });

    await visitCustomHtmlPage(
      page,
      mb,
      `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb, {})}
        <metabase-question question-id="${ORDERS_QUESTION_ID}" />
      `,
    );

    await waitForSimpleEmbedIframesToLoad(page);
    const frame = getSimpleEmbedIframe(page);

    await expect(
      tableInteractive(frame).getByText("Tax", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });

    await frame.getByTestId("viz-settings-button").click();
    await frame
      .getByRole("button", { name: /Add or remove columns/ })
      .click();

    const taxCheckbox = frame.getByLabel("Tax", { exact: true });
    await expect(taxCheckbox).toBeChecked();
    await taxCheckbox.click();

    // Positive anchors before the absence assertion (see header note).
    await expect(taxCheckbox).not.toBeChecked();
    await expect(
      tableInteractive(frame).getByText("Subtotal", { exact: true }),
    ).toBeVisible();

    await expect(
      tableInteractive(frame).getByText("Tax", { exact: true }),
    ).toHaveCount(0);
  });
});
