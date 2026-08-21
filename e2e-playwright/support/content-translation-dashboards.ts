/**
 * Helpers for the content-translation-dashboards spec port
 * (from e2e/test/scenarios/admin/i18n/content-translation/dashboards.cy.spec.ts).
 *
 * NEW helpers only (parallel-agent rule: no edits to shared modules). The
 * static-embedding surface (visitEmbeddedPage / openLegacyStaticEmbeddingModal /
 * publishChanges / EmbedPayload / addOrUpdateDashboardCard) and the create*
 * factories are imported by the spec from their existing shared modules.
 *
 * What lives here:
 * - uploadTranslationDictionaryViaAPI: the in-process CSV upload (multipart
 *   POST /api/ee/content-translation/upload-dictionary) that activates the EE
 *   content-translation dictionary. Port of the Cypress helper of the same
 *   name (e2e/support/helpers/e2e-content-translation-helpers.ts).
 * - the dictionary fixtures the spec's describes reuse (constants.ts).
 * - getDashboardTabDetails / getHeadingCardDetails / getTextCardDetails: the
 *   card/tab builders the "tab names and text cards" describe PUTs directly.
 *   The shared click-behavior.ts versions don't thread `dashboard_tab_id`, and
 *   this spec needs it, so faithful local copies live here (they share one
 *   negative-id counter so mixing heading + text cards can't collide —
 *   the wave-12 dashboard-tabs gotcha).
 */
import { Buffer } from "node:buffer";

import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { LOGIN_CACHE } from "./sample-data";

// === embed request waits (PORTING rule 2 — register BEFORE the trigger) ===

/** The `@dashboard` alias: GET /api/embed/dashboard/:token (top-level only). */
export function waitForEmbedDashboard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/embed\/dashboard\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The `@cardQuery` alias: GET /api/embed/dashboard/.../card/... */
export function waitForEmbedCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/embed\/dashboard\/.+\/card\/\d+/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The `@searchQuery` alias: GET /api/embed/dashboard/.../search/... */
export function waitForEmbedSearch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/embed\/dashboard\/.+\/search\//.test(
        new URL(response.url()).pathname,
      ),
  );
}

export type DictionaryRow = { locale: string; msgid: string; msgstr: string };
export type DictionaryArray = DictionaryRow[];

/** Port of getCSVWithHeaderRow (e2e-content-translation-helpers.ts). */
export function getCSVWithHeaderRow(dictionary: DictionaryArray): string {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary.map((r) => [r.locale, r.msgid, r.msgstr])]
    .map((row) => row.join(","))
    .join("\n");
}

/**
 * Port of H.uploadTranslationDictionaryViaAPI: sign in as admin and POST the
 * dictionary CSV as multipart form data. The MetabaseApi client only speaks
 * JSON `data`, so this drives the underlying request context directly with the
 * cached admin session header (the Cypress helper cy.signInAsAdmin()s first).
 */
export async function uploadTranslationDictionaryViaAPI(
  api: MetabaseApi,
  rows: DictionaryArray,
): Promise<void> {
  const session = LOGIN_CACHE.admin?.sessionId;
  const csv = getCSVWithHeaderRow(rows);
  const response = await api.requestContext.fetch(
    "/api/ee/content-translation/upload-dictionary",
    {
      method: "POST",
      headers: session ? { "X-Metabase-Session": session } : {},
      multipart: {
        file: {
          name: "dictionary.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        },
      },
    },
  );
  expect(
    response.status(),
    `upload-dictionary -> ${response.status()} ${await response
      .text()
      .catch(() => "")}`,
  ).toBe(200);
}

// === dictionary fixtures (from constants.ts) ===

export const germanFieldNames: DictionaryArray = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
  { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

export const germanFieldValues: DictionaryArray = [
  { locale: "de", msgid: "Doohickey", msgstr: "Dingsbums" },
  { locale: "de", msgid: "Gadget", msgstr: "Gerät" },
  { locale: "de", msgid: "Gizmo", msgstr: "Apparat" },
  { locale: "de", msgid: "Widget", msgstr: "Steuerelement" },
  { locale: "de", msgid: "Rustic Paper Wallet", msgstr: "Rustikale Papierbörse" },
];

export const frenchNames: DictionaryArray = [
  { locale: "fr", msgid: "Francesca Gleason", msgstr: "Glacia Froskeon" },
  { locale: "fr", msgid: "Francesca Hammes", msgstr: "Hammera Francite" },
  { locale: "fr", msgid: "Francesco Grant", msgstr: "Granto Francello" },
  { locale: "fr", msgid: "Francisco Robel", msgstr: "Robux Ciscoray" },
  { locale: "fr", msgid: "Franco O'Reilly", msgstr: "O'Reilux Francor" },
];

export const frenchBooleanTranslations: DictionaryArray = [
  { locale: "fr", msgid: "true", msgstr: "vrai" },
  { locale: "fr", msgid: "false", msgstr: "faux" },
];

// === card / tab builders (port of e2e-dashboard-helpers.ts) ===

const nextUnsavedDashboardCardId = (() => {
  let id = 0;
  return () => --id;
})();

/** Port of H.getDashboardTabDetails. */
export function getDashboardTabDetails({
  id,
  name,
}: {
  id: number;
  name: string;
}): { id: number; name: string } {
  return { id, name };
}

function virtualCard(display: string) {
  return {
    name: null,
    display,
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  };
}

/** Port of H.getHeadingCardDetails (threads col + dashboard_tab_id). */
export function getHeadingCardDetails({
  col = 0,
  row = 0,
  size_x = 24,
  size_y = 1,
  text = "Heading text details",
  ...cardDetails
}: {
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  text?: string;
  dashboard_tab_id?: number;
} = {}) {
  return {
    id: nextUnsavedDashboardCardId(),
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      "dashcard.background": false,
      virtual_card: virtualCard("heading"),
      text,
    },
    ...cardDetails,
  };
}

/** Port of H.getTextCardDetails (threads col + dashboard_tab_id). */
export function getTextCardDetails({
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text = "Text card",
  ...cardDetails
}: {
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  text?: string;
  dashboard_tab_id?: number;
} = {}) {
  return {
    id: nextUnsavedDashboardCardId(),
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: virtualCard("text"),
      text,
    },
    ...cardDetails,
  };
}
