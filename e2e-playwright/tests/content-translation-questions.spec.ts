/**
 * Playwright port of
 * e2e/test/scenarios/admin/i18n/content-translation/questions.cy.spec.ts
 *
 * Content translation of a question rendered as a static ("guest") embed:
 * upload a translation dictionary via the EE upload-dictionary API (a local,
 * in-process CSV — no external infra), JWT-embed a Products question with a
 * locale hash, and assert that the German column-name translations appear (or
 * don't) in the table header depending on the embed locale — and that the
 * dictionary does NOT leak into the normal (non-embedded) app.
 *
 * EE-gated: the whole file needs the pro-self-hosted token (content-translation
 * is a premium feature); skipped when it isn't available.
 *
 * Notes on the port:
 * - H.visitEmbeddedPage → support/embedding-dashboard.ts visitEmbeddedPage with
 *   a `{ question }` resource (signs a JWT and navigates top-level to
 *   /embed/question/<token>#locale=…; no iframe — static embeds render at the
 *   top level).
 * - The Cypress before()+snapshot()+beforeEach(restore(snapshot)) shape becomes
 *   the per-worker snapshotReady-flag pattern (mb is test-scoped, so no
 *   beforeAll): the Products question + dictionary are created once, snapshotted,
 *   and each test restores the snapshot. productsQuestionId is captured at
 *   snapshot-creation time and reused (the id survives the snapshot round-trip).
 * - The @uploadDictionary intercept in the Cypress beforeEach is never awaited
 *   (the upload happens via API in before()), so it is dropped.
 * - findByText string args are exact (rule 1); should("not.exist") → toHaveCount(0).
 */
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { resolveToken } from "../support/api";
import {
  germanFieldNames,
  uploadTranslationDictionaryViaAPI,
} from "../support/content-translation-dashboards";
import { visitEmbeddedPage } from "../support/embedding-dashboard";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitQuestion } from "../support/ui";

const { PRODUCTS_ID } = SAMPLE_DATABASE as unknown as { PRODUCTS_ID: number };

const NORMAL_USER_ID = (() => {
  const user = (
    SAMPLE_INSTANCE_DATA as { users: { id: number; email: string }[] }
  ).users.find(({ email }) => email === "normal@metabase.test");
  if (!user) {
    throw new Error("normal user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

test.skip(
  !resolveToken("pro-self-hosted"),
  "content translation is EE-gated (needs the pro-self-hosted token)",
);

test.describe("content translation > guest embeds > questions", () => {
  test.describe("ee", () => {
    const SNAPSHOT = "snapshot-for-questions";
    let snapshotReady = false;
    let productsQuestionId: number;

    test.beforeEach(async ({ mb }) => {
      if (!snapshotReady) {
        await mb.restore();
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        const card = await createQuestion(mb.api, {
          name: "Products question",
          query: {
            "source-table": PRODUCTS_ID,
          },
          enable_embedding: true,
        });
        productsQuestionId = card.id;

        await uploadTranslationDictionaryViaAPI(mb.api, germanFieldNames);
        await mb.api.snapshot(SNAPSHOT);
        snapshotReady = true;
      }
      await mb.restore(SNAPSHOT);
      await mb.signInAsAdmin();
    });

    test("when locale is English, column names are NOT localized in column headers", async ({
      mb,
      page,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: productsQuestionId }, params: {} },
        { additionalHashOptions: { locale: "en" } },
      );

      const header = page.getByTestId("table-header");
      for (const row of germanFieldNames) {
        await expect(header.getByText(row.msgid, { exact: true })).toBeVisible();
        await expect(header.getByText(row.msgstr, { exact: true })).toHaveCount(
          0,
        );
      }
    });

    test("when locale is German, column names ARE localized in column headers", async ({
      mb,
      page,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: productsQuestionId }, params: {} },
        { additionalHashOptions: { locale: "de" } },
      );

      const header = page.getByTestId("table-header");
      for (const row of germanFieldNames) {
        await expect(header.getByText(row.msgid, { exact: true })).toHaveCount(
          0,
        );
        await expect(
          header.getByText(row.msgstr, { exact: true }),
        ).toBeVisible();
      }
    });

    test("translations do not break questions in the normal app", async ({
      mb,
      page,
    }) => {
      await mb.signInAsNormalUser();
      await mb.api.put(`/api/user/${NORMAL_USER_ID}`, { locale: "de" });
      await visitQuestion(page, productsQuestionId);

      const header = page.getByTestId("table-header");
      for (const row of germanFieldNames) {
        // No field names are translated in the normal app.
        await expect(header.getByText(row.msgstr, { exact: true })).toHaveCount(
          0,
        );
        await expect(header.getByText(row.msgid, { exact: true })).toBeVisible();
      }
    });
  });
});
