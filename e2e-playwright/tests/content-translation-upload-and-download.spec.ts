/**
 * Playwright port of
 * e2e/test/scenarios/admin/i18n/content-translation/upload-and-download.cy.spec.ts
 *
 * The content-translation dictionary admin flow: upload a translation dictionary
 * CSV (ASCII / non-ASCII / hyphenated locale / whitespace-only rows), reject bad
 * uploads (duplicate strings, invalid locales, oversized file, malformed CSV),
 * download the current dictionary CSV, and verify the round-trip via the guest
 * dictionary API. All local, in-process infra (multipart CSV upload + a real
 * file download) — no external DB / email / webhook.
 *
 * EE-gated: content translation is a premium feature; the whole file is skipped
 * when the pro-self-hosted token isn't available. The jar build activates it.
 *
 * Notes on the port:
 * - The Cypress `before()` snapshot("snapshot-for-upload-and-download") +
 *   beforeEach(restore(snapshot)) pattern collapses to a per-test
 *   restore()+signInAsAdmin()+activateToken() (token activation is cheap), the
 *   same shape content-translation-dashboards.spec.ts uses.
 * - The @uploadDictionary/@uploadDictionarySpy intercepts become
 *   waitForResponse (rule 2) and, for the too-big test, a request counter.
 * - findByRole("status") toasts can leave a fading duplicate under load
 *   (transient-UI gotcha) → assert .first().
 * - New helpers live in support/content-translation-upload-and-download.ts;
 *   the upload-via-API helper, CSV serializer and germanFieldNames fixture are
 *   imported read-only from support/content-translation-dashboards.ts.
 */
import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import {
  germanFieldNames,
  getCSVWithHeaderRow,
  uploadTranslationDictionaryViaAPI,
} from "../support/content-translation-dashboards";
import {
  assertOnlyTheseTranslationsAreStored,
  generateLargeCSV,
  invalidLocaleXX,
  multipleInvalidLocales,
  nonAsciiFieldNames,
  portugueseFieldNames,
  selectDictionaryFile,
  stringTranslatedTwice,
  uploadTranslationDictionary,
} from "../support/content-translation-upload-and-download";
import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";

test.skip(
  !resolveToken("pro-self-hosted"),
  "content translation is EE-gated (needs the pro-self-hosted token)",
);

/** An alert element whose text matches `pattern` (findAllByRole("alert").contains). */
function alertContaining(page: Page, pattern: RegExp) {
  return page.getByRole("alert").filter({ hasText: pattern }).first();
}

test.describe("scenarios > admin > embedding > guest embeds > content translation", () => {
  test.describe("oss", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("admin settings configuration form is not present", async ({
      page,
    }) => {
      await page.goto("/admin/embedding/guest");
      await expect(
        page.getByTestId("content-translation-configuration"),
      ).toHaveCount(0);
    });
  });

  test.describe("ee", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test.describe("The translation download button", () => {
      test("downloads the stored translations", async ({ mb, page }) => {
        await uploadTranslationDictionaryViaAPI(mb.api, germanFieldNames);
        await page.goto("/admin/embedding");

        const downloadPromise = page.waitForEvent("download");
        await page
          .getByTestId("content-translation-configuration")
          .getByRole("button", {
            name: /Get translation dictionary template/i,
          })
          .click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe(
          "metabase-content-translations.csv",
        );
        const contents = await readFile(await download.path(), "utf8");
        expect(contents).toContain("de,Rating,Bewertung");
      });
    });

    test.describe("The translation upload form", () => {
      test("accepts a CSV upload with ASCII characters", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, germanFieldNames);
        await expect(
          page.getByRole("status").getByText("Dictionary uploaded").first(),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("content-localization-setting")
            .getByText("Dictionary uploaded"),
        ).toBeVisible();
        await assertOnlyTheseTranslationsAreStored(mb, germanFieldNames);
      });

      test("accepts a CSV upload with non-ASCII characters", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, nonAsciiFieldNames);
        await expect(
          page
            .getByTestId("content-localization-setting")
            .getByText("Dictionary uploaded"),
        ).toBeVisible();
        for (const { locale, msgid, msgstr } of nonAsciiFieldNames) {
          await assertOnlyTheseTranslationsAreStored(
            mb,
            [{ locale, msgid, msgstr }],
            locale,
          );
        }
      });

      test("accepts a CSV upload with a hyphenated locale", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, portugueseFieldNames);
        await expect(
          page
            .getByTestId("content-localization-setting")
            .getByText("Dictionary uploaded"),
        ).toBeVisible();
        await mb.signInAsNormalUser();
        await assertOnlyTheseTranslationsAreStored(
          mb,
          portugueseFieldNames,
          "pt-BR",
        );
      });

      test("does not store rows with translations made of only whitespace and/or semicolons", async ({
        mb,
        page,
      }) => {
        const blankTranslation = { locale: "de", msgid: "Cat", msgstr: "" };
        const translationWithJustSpaces = {
          locale: "de",
          msgid: "Spaces",
          msgstr: "  ",
        };
        const translationWithJustTabs = {
          locale: "de",
          msgid: "Tabs",
          msgstr: "\t\t",
        };
        const translationWithJustSemicolons = {
          locale: "de",
          msgid: "Semicolons",
          msgstr: ";;",
        };
        const translationsWithBlanks = [
          ...germanFieldNames,
          blankTranslation,
          translationWithJustSpaces,
          translationWithJustTabs,
          translationWithJustSemicolons,
        ];
        await uploadTranslationDictionary(page, mb, translationsWithBlanks);
        await assertOnlyTheseTranslationsAreStored(mb, germanFieldNames);
      });

      test("rejects a CSV upload that provides two translations for the same string", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, stringTranslatedTwice);
        await expect(
          alertContaining(page, /couldn.*t upload the file/),
        ).toBeVisible();
        await expect(
          alertContaining(
            page,
            new RegExp(
              `Row ${stringTranslatedTwice.length + 1}.*earlier in the file`,
            ),
          ),
        ).toBeVisible();
      });

      test("rejects a CSV upload with invalid locale in one row", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, invalidLocaleXX);
        await expect(
          alertContaining(page, /couldn.*t upload the file/),
        ).toBeVisible();
        await expect(
          alertContaining(page, /Row 2: Invalid locale: xx/),
        ).toBeVisible();
      });

      test("erases previously stored translations when a new CSV is uploaded", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, germanFieldNames);
        await assertOnlyTheseTranslationsAreStored(mb, germanFieldNames);

        const oneArabicFieldName = [nonAsciiFieldNames[0]];
        await uploadTranslationDictionary(page, mb, oneArabicFieldName);
        await assertOnlyTheseTranslationsAreStored(mb, oneArabicFieldName, "ar");
      });

      test("does not erase previously stored translations when an upload fails", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, germanFieldNames);
        await assertOnlyTheseTranslationsAreStored(mb, germanFieldNames);
        await uploadTranslationDictionary(page, mb, invalidLocaleXX);
        await assertOnlyTheseTranslationsAreStored(mb, germanFieldNames);
      });

      test("rejects a CSV upload with invalid locales in multiple rows", async ({
        mb,
        page,
      }) => {
        await uploadTranslationDictionary(page, mb, multipleInvalidLocales);
        await expect(
          alertContaining(page, /couldn.*t upload the file/),
        ).toBeVisible();
        // The first error is in row 2 (the first row is the header).
        await expect(
          alertContaining(page, /Row 2: Invalid locale/),
        ).toBeVisible();
        await expect(
          alertContaining(page, /Row 5: Invalid locale/),
        ).toBeVisible();
      });

      test("rejects, in the frontend, a CSV upload that is too big", async ({
        page,
      }) => {
        await page.goto("/admin/embedding");

        // The frontend should prevent the upload attempt; the endpoint should
        // not be called (the @uploadDictionarySpy assertion).
        let uploadCalled = false;
        page.on("request", (request) => {
          if (
            request.method() === "POST" &&
            new URL(request.url()).pathname ===
              "/api/ee/content-translation/upload-dictionary"
          ) {
            uploadCalled = true;
          }
        });

        await selectDictionaryFile(
          page,
          generateLargeCSV({ sizeInMebibytes: 1.6 }),
        );

        await expect(
          alertContaining(page, /The file is larger than 1.5 MB/),
        ).toBeVisible();
        expect(uploadCalled).toBe(false);
      });

      test("rejects invalid CSV", async ({ page }) => {
        await page.goto("/admin/embedding");
        const validCSV = getCSVWithHeaderRow(germanFieldNames);
        const invalidCSV = validCSV + '\nde,Price,"Preis"X';

        const uploadResponse = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
              "/api/ee/content-translation/upload-dictionary",
        );

        await selectDictionaryFile(page, invalidCSV);
        await uploadResponse;

        await expect(alertContaining(page, /CSV error/)).toBeVisible();
        await expect(
          page
            .getByRole("status")
            .getByText("Could not upload dictionary")
            .first(),
        ).toBeVisible();
      });
    });
  });
});
