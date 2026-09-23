/**
 * Helpers for the recently-viewed port
 * (e2e/test/scenarios/search/recently-viewed.cy.spec.js).
 *
 * Everything else (embedding harness, search bar, entity picker, command
 * palette, moderation review, create* factories) is imported read-only from
 * the shared support modules — only the two things unique to this spec live
 * here: the server-clock advance and the recents-item row assertion.
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/**
 * Port of the spec-local advanceServerClockBy: POST /api/testing/set-time
 * with `add-ms`, which moves the (mock) server clock forward relative to its
 * current value, so the view-log timestamps that drive recents ordering are
 * deterministically spaced. restore() resets the mock clock.
 */
export async function advanceServerClockBy(
  api: MetabaseApi,
  milliseconds: number,
) {
  await api.post("/api/testing/set-time", { "add-ms": milliseconds });
}

/**
 * Port of the spec-local assertRecentlyViewedItem: the index-th
 * `recently-viewed-item-title` has exactly `title`, and the index-th
 * `result-link-wrapper` has exactly `type`. `.should("have.text", …)` is a
 * full-text (exact) match → toHaveText. Scoped to the embedding iframe.
 */
export async function assertRecentlyViewedItem(
  scope: Page | FrameLocator,
  index: number,
  title: string,
  type: string,
) {
  await expect(
    scope.getByTestId("recently-viewed-item-title").nth(index),
  ).toHaveText(title);
  await expect(
    scope.getByTestId("result-link-wrapper").nth(index),
  ).toHaveText(type);
}
