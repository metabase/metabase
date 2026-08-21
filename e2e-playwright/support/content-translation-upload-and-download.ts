/**
 * Helpers for the content-translation-upload-and-download spec port
 * (from e2e/test/scenarios/admin/i18n/content-translation/upload-and-download.cy.spec.ts).
 *
 * NEW helpers only (parallel-agent rule: no edits to shared modules). The
 * in-process CSV upload-via-API helper, the CSV serializer, the DictionaryArray
 * type and the germanFieldNames fixture are imported read-only from the existing
 * support/content-translation-dashboards.ts; the embedding secret key from
 * support/embedding.ts.
 *
 * What lives here (all NEW to this spec — none exist in shared modules):
 * - uploadTranslationDictionary: the UI upload flow (select the hidden CSV file
 *   input, confirm the "Upload new dictionary?" dialog, await the endpoint).
 *   Port of the spec-local helper of the same name.
 * - assertOnlyTheseTranslationsAreStored: sign a guest JWT, sign in as a normal
 *   user, GET the dictionary via /api/ee/content-translation/dictionary/:token
 *   and compare the sorted msgstrs. Port of the spec-local helper.
 * - generateLargeCSV: build an oversized CSV string. Port of the spec-local.
 * - selectDictionaryFile: drive the hidden file input + confirmation dialog
 *   without awaiting the endpoint (for the too-big / invalid-CSV tests that the
 *   Cypress spec drove inline).
 * - the dictionary fixtures the spec's describes reuse that are NOT in the
 *   shared module: nonAsciiFieldNames, portugueseFieldNames, invalidLocaleXX,
 *   multipleInvalidLocales, stringTranslatedTwice (constants.ts).
 */
import { Buffer } from "node:buffer";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import jwt from "jsonwebtoken";

import type { MetabaseApi } from "./api";
import {
  DictionaryArray,
  getCSVWithHeaderRow,
  germanFieldNames,
} from "./content-translation-dashboards";
import { METABASE_SECRET_KEY } from "./embedding";

export type { DictionaryArray } from "./content-translation-dashboards";

/** The subset of the mb fixture these helpers need. */
export type TranslationHarness = {
  api: MetabaseApi;
  signInAsAdmin(): Promise<void>;
  signInAsNormalUser(): Promise<void>;
};

// === dictionary fixtures not carried by content-translation-dashboards.ts ===
// (Ports of the corresponding exports in constants.ts.)

export const nonAsciiFieldNames: DictionaryArray = [
  { locale: "ar", msgid: "Title", msgstr: "العنوان" },
  { locale: "he", msgid: "Title", msgstr: "כותרת" },
  { locale: "ja", msgid: "Title", msgstr: "タイトル" },
  { locale: "ko", msgid: "Title", msgstr: "제목" },
  { locale: "ru", msgid: "Title", msgstr: "Название" },
  { locale: "tr", msgid: "Title", msgstr: "Başlık" },
  { locale: "uk", msgid: "Title", msgstr: "Заголовок" },
  { locale: "vi", msgid: "Title", msgstr: "Tiêu đề" },
  { locale: "zh-TW", msgid: "Title", msgstr: "标题" },
  { locale: "en", msgid: "Butterfly", msgstr: "🦋" },
];

export const portugueseFieldNames: DictionaryArray = [
  { locale: "pt-BR", msgid: "Title", msgstr: "Título" },
  { locale: "pt-BR", msgid: "Vendor", msgstr: "Fornecedor" },
  { locale: "pt-BR", msgid: "Rating", msgstr: "Avaliação" },
  { locale: "pt-BR", msgid: "Category", msgstr: "Categoria" },
  { locale: "pt-BR", msgid: "Created At", msgstr: "Criado em" },
  { locale: "pt-BR", msgid: "Price", msgstr: "Preço" },
];

// clone(germanFieldNames) with the first row's locale invalidated.
export const invalidLocaleXX: DictionaryArray = structuredClone(germanFieldNames);
invalidLocaleXX[0].locale = "xx";

// clone(germanFieldNames) with rows 0 and 3 given invalid locales.
export const multipleInvalidLocales: DictionaryArray =
  structuredClone(germanFieldNames);
multipleInvalidLocales[0].locale = "ze";
multipleInvalidLocales[3].locale = "qe";

// clone(germanFieldNames) with a second "Title" translation appended.
export const stringTranslatedTwice: DictionaryArray =
  structuredClone(germanFieldNames);
stringTranslatedTwice.push({
  locale: "de",
  msgid: "Title",
  msgstr: "Überschrift",
});

// === UI upload flow ===

/**
 * Drive the hidden CSV file input and confirm the replace-dictionary dialog,
 * WITHOUT waiting for the upload endpoint. Used by the too-big test (the
 * frontend rejects before any request fires) and the invalid-CSV test (which
 * registers its own wait). The input has `display: none`; Playwright's
 * setInputFiles doesn't require visibility.
 */
export async function selectDictionaryFile(page: Page, contents: string | Buffer) {
  await page
    .locator("#content-translation-dictionary-upload-input")
    .setInputFiles({
      name: "file.csv",
      mimeType: "text/csv",
      buffer: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
    });

  await page
    .getByRole("dialog", { name: /upload new dictionary/i })
    .getByRole("button", { name: "Replace existing dictionary" })
    .click();
}

/**
 * Port of the spec-local uploadTranslationDictionary: sign in as admin (the
 * Cypress helper does this too — assertOnlyTheseTranslationsAreStored leaves the
 * session as a normal user, and several tests upload again afterwards), navigate
 * to the embedding admin page, select the CSV, confirm the dialog and await the
 * upload endpoint (which resolves on any status — the server-rejection tests
 * inspect the alerts afterwards).
 */
export async function uploadTranslationDictionary(
  page: Page,
  mb: TranslationHarness,
  rows: DictionaryArray,
) {
  await mb.signInAsAdmin();
  await page.goto("/admin/embedding");

  await expect(
    page
      .getByTestId("content-localization-setting")
      .getByText(/Upload edited translation dictionary/),
  ).toBeVisible();

  // Register BEFORE the triggering click (PORTING rule 2). Resolves on any
  // status; the rejection tests then read the rendered error alerts.
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/ee/content-translation/upload-dictionary",
  );

  await selectDictionaryFile(page, getCSVWithHeaderRow(rows));

  await uploadResponse;

  await page
    .getByRole("heading", {
      name: "Translate embedded dashboards and questions",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
}

// === stored-translations assertion ===

/**
 * Port of the spec-local assertOnlyTheseTranslationsAreStored: sign a guest JWT
 * with the embedding secret key, sign in as a normal (non-admin) user, GET the
 * dictionary via the guest-token endpoint, and assert its msgstrs match `rows`
 * exactly (order-independent). Faithful to signJwt (object payload → jwt.sign),
 * which the e2e-jwt-tasks task uses.
 */
export async function assertOnlyTheseTranslationsAreStored(
  mb: TranslationHarness,
  rows: DictionaryArray,
  locale = "de",
) {
  const jwtToken = jwt.sign(
    {
      question: 1,
      exp: Math.round(Date.now() / 1000) + 10 * 60,
    },
    METABASE_SECRET_KEY,
  );

  // A normal user should be able to get the translations via the API.
  await mb.signInAsNormalUser();
  const response = await mb.api.get(
    `/api/ee/content-translation/dictionary/${jwtToken}?locale=${locale}`,
  );
  const body = (await response.json()) as {
    data: { msgstr: string }[];
  };
  const msgstrs = body.data.map((row) => row.msgstr);
  expect([...msgstrs].sort()).toEqual(
    rows.map((row) => row.msgstr).sort(),
  );
}

// === oversized-CSV generator ===

/** Port of the spec-local generateLargeCSV. */
export function generateLargeCSV({
  sizeInMebibytes,
}: {
  sizeInMebibytes: number;
}): string {
  const oneMebibyte = 2 ** 20;
  const row = "de,data2,data3\n";
  const charsPerRow = row.length;
  const totalRows = Math.floor((sizeInMebibytes * oneMebibyte) / charsPerRow);
  const header = "locale,string,translation\n";
  return header + row.repeat(totalRows);
}
