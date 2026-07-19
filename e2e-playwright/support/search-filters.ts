/**
 * Helpers for e2e/test/scenarios/search/search-filters.cy.spec.js — the
 * filter sidebar on the full-page search app (/search): filter by type,
 * created-by, last-edited-by, created-at, last-edited-at, verified,
 * native-query, personal-collection and trashed items.
 *
 * Everything the spec needs beyond this file is imported read-only from the
 * shared modules: expectSearchResultContent / waitForSearchResponse
 * (support/search.ts), commandPaletteSearch (support/search-pagination.ts, the
 * viewAll=true form that lands on the full-page search app), the create*
 * factories, and summarize (support/nested-questions.ts).
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "./api";
import { SAMPLE_DB_ID } from "./sample-data";

// === instance-data constants (cypress_sample_instance_data.js) ===

function findUserId(email: string): number {
  const user = SAMPLE_INSTANCE_DATA.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`User "${email}" not found in cypress_sample_instance_data`);
  }
  return Number(user.id);
}

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (c) => c.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find((q) => q.name === name);
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

export const ADMIN_USER_ID = findUserId("admin@metabase.test");
export const NORMAL_USER_ID = findUserId("normal@metabase.test");
export const ADMIN_PERSONAL_COLLECTION_ID = findCollectionId(
  "Bobby Tables's Personal Collection",
);
export const NORMAL_PERSONAL_COLLECTION_ID = findCollectionId(
  "Robert Tableton's Personal Collection",
);
export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");

// === helpers ===

/** Port of H.createModerationReview (api/createModerationReview.ts). */
export async function createModerationReview(
  api: MetabaseApi,
  {
    status,
    moderated_item_type,
    moderated_item_id,
  }: {
    status: "verified" | null;
    moderated_item_type: "card";
    moderated_item_id: number;
  },
) {
  await api.post("/api/moderation-review", {
    status,
    moderated_item_id,
    moderated_item_type,
  });
}

/**
 * Port of the spec-local expectSearchResultItemNameContent: the
 * `search-result-item-name` text nodes must include every name in `itemNames`
 * (chai `include.members`), and — when `strict` (the default) — have exactly
 * that many results. Wrapped in toPass so it retries as the search-app
 * re-renders, matching Cypress's retried `.then()`.
 */
export async function expectSearchResultItemNameContent(
  scope: Page | FrameLocator,
  { itemNames }: { itemNames: string[] },
  { strict = true }: { strict?: boolean } = {},
) {
  const names = scope.getByTestId("search-result-item-name");
  await expect(async () => {
    const texts = await names.allTextContents();
    expect(texts).toEqual(expect.arrayContaining(itemNames));
    if (strict) {
      expect(texts).toHaveLength(itemNames.length);
    }
  }).toPass();
}

/**
 * The type-filter describe seeds a model, an action, a model-index
 * (indexed-entity) and a document AFTER restore; those are indexed
 * asynchronously, and mb.restore()'s readiness poll only covers a table. A
 * type-filter search fired too early renders a permanent empty/short result
 * set (the FE never re-queries). Poll the search endpoint (nudging a
 * force-reindex once) until at least `minCount` items of `model` match `query`.
 */
export async function waitForModelIndexed(
  api: MetabaseApi,
  query: string,
  model: string,
  minCount = 1,
) {
  const deadline = Date.now() + 30_000;
  let forcedReindex = false;
  while (Date.now() < deadline) {
    const response = await api.get(
      `/api/search?q=${encodeURIComponent(query)}&models=${model}&limit=100`,
      { failOnStatusCode: false },
    );
    if (response.ok()) {
      const body = await response.json().catch(() => ({ data: [] }));
      if ((body.data ?? []).length >= minCount) {
        return;
      }
    }
    if (!forcedReindex) {
      forcedReindex = true;
      await api.post("/api/search/force-reindex", undefined, {
        failOnStatusCode: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * The last_edited_by / last_edited_at describes edit questions AFTER restore,
 * and the search index reflects the new last-editor asynchronously — a search
 * fired too early returns the stale creation info (the result renders
 * "Created … by <creator>" instead of "Updated … by <editor>"). Poll the card
 * search (nudging a force-reindex once) until every named card reports the
 * expected `last_editor_id`. `expected` maps card name → editor user id.
 */
export async function waitForLastEditors(
  api: MetabaseApi,
  expected: Record<string, number>,
) {
  const deadline = Date.now() + 60_000;
  let byName = new Map<string, number | undefined>();
  let attempts = 0;
  while (Date.now() < deadline) {
    const response = await api.get(
      "/api/search?q=Reviews&models=card&limit=100",
      { failOnStatusCode: false },
    );
    if (response.ok()) {
      const body = await response
        .json()
        .catch(() => ({ data: [] as { name: string; last_editor_id?: number }[] }));
      byName = new Map(
        (body.data ?? []).map(
          (r: { name: string; last_editor_id?: number }) => [
            r.name,
            r.last_editor_id,
          ],
        ),
      );
      const satisfied = Object.entries(expected).every(
        ([name, editorId]) => byName.get(name) === editorId,
      );
      if (satisfied) {
        return;
      }
    }
    // Re-nudge a force-reindex periodically: under CI/parallel load a single
    // trigger can be dropped, leaving the index stale past a one-shot nudge.
    if (attempts % 8 === 0) {
      await api.post("/api/search/force-reindex", undefined, {
        failOnStatusCode: false,
      });
    }
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `search index never reported the expected last editors within 60s. ` +
      `expected=${JSON.stringify(expected)} got=${JSON.stringify(
        Object.fromEntries(byName),
      )}`,
  );
}

/**
 * Port of the last_edited_by / last_edited_at describes' inline edit flow
 * (open the question, Summarize → Done → Save). What those describes assert is
 * the *last-editor attribution* on search results — "Updated a few seconds ago
 * by <editor>" — so the edit is performed via an API PUT as the currently
 * signed-in user: adding a `count` aggregation to the question's query.
 *
 * Two subtleties this shape handles that the naive attempts did not:
 * - It must be a real QUERY change. A description-only PUT does bump the search
 *   index's last_editor_id, but the FE still renders "Created … by <creator>"
 *   (its Created-vs-Updated decision needs a content revision), so those
 *   describes fail.
 * - The PUT must send a fresh LEGACY dataset_query (the shape createQuestion
 *   uses). Echoing back the card's stored MBQL 5 query with a `query` key added
 *   is rejected 400 ("MBQL 4 keys … not allowed in MBQL 5 queries").
 *
 * Doing it via the API (rather than the summarize sidebar) also dodges a UI
 * race: under load "Done" could fire before the default aggregation registered,
 * saving an unchanged card that recorded no edit at all. `api` must already be
 * signed in as the user whose edit should be recorded; `query` is the
 * question's original (legacy) query.
 *
 * The FE only renders "Updated …" when last_edited_at differs from created_at
 * by at least a second (InfoTextEditedInfo: `!dayjs(last_edited_at).isSame(
 * created_at, "seconds")`); an API edit fired <1s after creation lands in the
 * same second and renders "Created …" instead. The UI flow was always slow
 * enough to clear this; here we wait a beat so the edit's second differs.
 */
export async function editQuestionByAddingSummarize(
  api: MetabaseApi,
  questionId: number,
  query: Record<string, unknown>,
) {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await api.put(`/api/card/${questionId}`, {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { ...query, aggregation: [["count"]] },
    },
  });
}
