/**
 * Helpers for the scatter spec port
 * (e2e/test/scenarios/visualizations-charts/scatter.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Only the spec-local `triggerPopoverForBubble` lives
 * here; everything else (cartesianChartCircles, assertEChartsTooltip[NotContain],
 * openVizSettingsSidebar, leftSidebar, visitAdhoc/visitNativeAdhoc) is imported
 * read-only from the shared modules.
 */
import type { Page } from "@playwright/test";

import { cartesianChartCircles } from "./metrics";

/**
 * Port of the spec-local triggerPopoverForBubble(index, force).
 *
 * The Cypress original toggles data view → visualization view to work around
 * ExplicitSize throttle flakiness (metabase#15235), then
 * `H.cartesianChartCircle().eq(index).trigger("mousemove", { force })`.
 *
 * `.trigger("mousemove")` is a synthetic MouseEvent dispatch (the wave-13
 * gotcha), and ECharts (zrender) hit-tests the tooltip from the event's
 * clientX/clientY — so we dispatch at the target bubble's center, exactly like
 * line-chart.ts / boxplot.ts. Cypress's `force` bypassed actionability on
 * overlapping bubbles; a direct synthetic dispatch resolves the target bubble
 * regardless of overlap, so the flag is a no-op here (kept for signature
 * fidelity).
 */
export async function triggerPopoverForBubble(
  page: Page,
  index = 13,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  force = false,
) {
  // The view-footer toggle is a SegmentedControl that marks both options
  // `disabled` and switches via the root onClick, so the aria-labelled svg is a
  // disabled descendant — force the click (the app's intent; Cypress clicks
  // through it too). Same gotcha as pie-chart / viz-tabular-reproductions.
  const viewFooter = page.getByTestId("view-footer");
  await viewFooter
    .getByLabel("Switch to data", { exact: true })
    .click({ force: true });
  await viewFooter
    .getByLabel("Switch to visualization", { exact: true })
    .click({ force: true });

  await cartesianChartCircles(page)
    .nth(index)
    .evaluate((node) => {
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        }),
      );
    });
}
