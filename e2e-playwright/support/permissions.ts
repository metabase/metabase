/**
 * Helpers for the permissions specs. Lives in its own file so the shared
 * support modules stay untouched.
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { BASE_URL } from "./env";
import { LOGIN_CACHE } from "./sample-data";

/**
 * Port of ADMIN_PERSONAL_COLLECTION_ID from
 * e2e/support/cypress_sample_instance_data.js. Not in support/sample-data.ts,
 * so it's looked up here the same way that file does it.
 */
export const ADMIN_PERSONAL_COLLECTION_ID = findCollectionId(
  "Bobby Tables's Personal Collection",
);

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (collection) => collection.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

/**
 * Sign in as any user with a cached session (e.g. "none"), mirroring the
 * cookie injection in support/fixtures.ts. The mb fixture's signIn is typed
 * to the USERS credential map, which doesn't include every cached user; this
 * covers the rest. Note: it only sets browser cookies — mb.api calls keep
 * running as whichever user mb.signIn last set (or anonymously).
 */
export async function signInWithCachedSession(
  context: BrowserContext,
  user: string,
) {
  const cached = LOGIN_CACHE[user];
  if (!cached) {
    throw new Error(`No cached session for user "${user}" in the login cache`);
  }
  const { hostname } = new URL(BASE_URL);
  const cookie = { domain: hostname, path: "/" };
  await context.addCookies([
    {
      name: "metabase.SESSION",
      value: cached.sessionId,
      httpOnly: true,
      ...cookie,
    },
    { name: "metabase.TIMEOUT", value: "alive", ...cookie },
    {
      name: "metabase.DEVICE",
      value: cached.deviceId,
      httpOnly: true,
      ...cookie,
    },
  ]);
}

/** Port of cy.icon (e2e/support/commands/ui/icon.ts). */
export { icon } from "./ui";

type AdhocQuestion = {
  display?: string;
  visualization_settings?: Record<string, unknown>;
  dataset_query: {
    type: "native" | "query";
    database: number;
    native?: { query: string; "template-tags"?: Record<string, unknown> };
    query?: Record<string, unknown>;
  };
};

/**
 * Port of adhocQuestionHash (e2e/support/helpers/e2e-ad-hoc-question-helpers.js).
 * The Cypress original is btoa(JSON.stringify(...)) once the no-op
 * decodeURIComponent(encodeURIComponent(...)) round-trip is stripped.
 */
export function adhocQuestionHash(question: AdhocQuestion): string {
  const questionWithDisplay = {
    display: "table",
    // without "locking" the display, the QB will run its picking logic and
    // override the setting
    displayIsLocked: question.display != null,
    ...question,
  };
  return Buffer.from(JSON.stringify(questionWithDisplay)).toString("base64");
}

/**
 * Port of H.visitQuestionAdhoc, minus the notebook mode and the native
 * autorun branch (those need runNativeQuery, not ported yet). Response waits
 * are registered before the navigation that triggers them, matching the
 * cy.intercept + cy.wait pairs in the original.
 */
export async function visitQuestionAdhoc(
  page: Page,
  question: AdhocQuestion,
  { autorun = true }: { autorun?: boolean } = {},
) {
  const {
    display,
    dataset_query: { type },
  } = question;
  if (type === "native" && autorun) {
    throw new Error(
      "visitQuestionAdhoc: native autorun is not ported (needs runNativeQuery)",
    );
  }

  // Ad-hoc native queries are not autorun, so there is no dataset response
  // to wait for — the snippet fetch marks the native editor as loaded.
  const dataPath =
    type === "native"
      ? "/api/native-query-snippet"
      : display === "pivot"
        ? "/api/dataset/pivot"
        : "/api/dataset";

  const metadataResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dataset/query_metadata",
  );
  const dataResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === dataPath,
  );
  await page.goto(`/question#${adhocQuestionHash(question)}`);
  await Promise.all([metadataResponse, dataResponse]);
}
